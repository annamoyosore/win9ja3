import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  Query,
  account,
} from "../lib/appwrite";

import boardImg from "./board.png";

const GAME = "snakegame";
const WALLET = "wallets";
const SIZE = 100;

// =========================
// SNAKES & LADDERS
// =========================
const snakes = {
  50: 5,
  43: 17,
  56: 8,
  68: 15,
  84: 58,
  87: 49,
  98: 40,
};

const ladders = {
  2: 23,
  6: 45,
  20: 59,
  57: 96,
  52: 72,
  71: 92,
};

// =========================
// HELPERS
// =========================
function getCoords(pos) {
  const index = pos - 1;
  const row = Math.floor(index / 10);
  let col = index % 10;

  if (row % 2 === 1) col = 9 - col;

  return {
    left: `${col * 10 + 5}%`,
    top: `${(9 - row) * 10 + 5}%`,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeParse(data, fallback) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data || fallback;
  } catch {
    return fallback;
  }
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function keepLast6(arr, val) {
  return [...(arr || []), val].slice(-6);
}

// =========================
// GAME COMPONENT
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [history, setHistory] = useState([]);

  const [turn, setTurn] = useState("A");

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  const pot = Number(game?.pot || 0);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;
    loadGame();
  }, [gameId]);

  async function loadGame() {
    const res = await databases.getDocument(
      DATABASE_ID,
      GAME,
      gameId
    );

    setGame(res);
    setPositions(safeParse(res.positions, { A: 1, B: 1 }));
    setHistory(safeParse(res.history, []).slice(-6));
    setTurn(res.turn || "A");
  }

  // =========================
  // EFFECTS
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  // =========================
  // DICE ANIMATION
  // =========================
  async function rollDiceAnim() {
    setRolling(true);

    let count = 0;

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        setDice(Math.floor(Math.random() * 6) + 1);
        count++;

        if (count > 10) {
          clearInterval(interval);
          const final = rollDice();
          setDice(final);
          setRolling(false);
          resolve(final);
        }
      }, 70);
    });
  }

  // =========================
  // PAYOUT
  // =========================
  async function handleWin(winner, data) {
    let countdown = 5;

    const timer = setInterval(async () => {
      countdown--;

      setGame((prev) => ({
        ...prev,
        countdown,
        status: "ending",
      }));

      if (countdown <= 0) {
        clearInterval(timer);

        try {
          const wallet = await databases.listDocuments(
            DATABASE_ID,
            WALLET,
            [Query.equal("userId", winner)]
          );

          if (wallet.documents.length) {
            const w = wallet.documents[0];

            await databases.updateDocument(
              DATABASE_ID,
              WALLET,
              w.$id,
              {
                balance:
                  Number(w.balance || 0) + Number(data.pot || 0),
              }
            );
          }

          await databases.updateDocument(
            DATABASE_ID,
            GAME,
            gameId,
            {
              status: "finished",
              pot: 0,
            }
          );
        } catch (e) {
          console.log(e);
        }
      }
    }, 1000);
  }

  // =========================
  // PLAY TURN (LOCKED)
  // =========================
  async function playTurn() {
    if (!game || moving || rolling) return;
    if (game.status !== "playing") return;

    setMoving(true);

    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME,
      gameId
    );

    const player = fresh.turn;

    const diceValue = await rollDiceAnim();

    let pos = safeParse(fresh.positions, { A: 1, B: 1 });

    let current = pos[player];

    for (let i = 0; i < diceValue; i++) {
      await sleep(120);
      current++;
      if (current > SIZE) current = SIZE;

      setPositions((p) => ({
        ...p,
        [player]: current,
      }));
    }

    const finalPos = applyEffects(current);
    pos[player] = finalPos;

    const winner = finalPos >= SIZE ? player : "";
    const nextTurn = player === "A" ? "B" : "A";

    const newHistory = keepLast6(
      safeParse(fresh.history, []),
      {
        player: player === "A" ? "Player A" : "Player B",
        dice: diceValue,
        from: current,
        to: finalPos,
      }
    );

    const updated = {
      ...fresh,
      positions: JSON.stringify(pos),
      turn: nextTurn,
      history: JSON.stringify(newHistory),
      status: winner ? "ending" : "playing",
      winner,
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updated
    );

    setGame(updated);
    setPositions(pos);
    setTurn(nextTurn);
    setHistory(newHistory);

    if (winner) {
      await handleWin(winner, updated);
    }

    setMoving(false);
  }

  const getPos = (p) => positions[p] || 1;

  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* INFO */}
      <div style={styles.info}>
        🎲 Dice: {dice} <br />
        Turn:{" "}
        <b style={{ color: turn === "A" ? "lime" : "deepskyblue" }}>
          Player {turn}
        </b>
        <br />
        💰 Pot: ₦{pot}
      </div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(getPos(p)),
              background: p === "A" ? "#ef4444" : "#3b82f6",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* CONTROLS */}
      <div style={styles.controls}>
        <div
          style={{
            ...styles.dice,
            transform: rolling ? "rotate(360deg)" : "rotate(0deg)",
          }}
        >
          🎲 {dice}
        </div>

        <button
          onClick={playTurn}
          disabled={moving || rolling || game.status !== "playing"}
          style={styles.button}
        >
          {rolling ? "Rolling..." : "Roll Dice"}
        </button>
      </div>

      {/* HISTORY */}
      <div style={styles.history}>
        <h4>Last 6 Moves</h4>
        {history.map((h, i) => (
          <div key={i}>
            {h.player} 🎲{h.dice}: {h.from} → {h.to}
          </div>
        ))}
      </div>

      {game.status === "ending" && (
        <div style={{ color: "gold" }}>
          ⏳ Paying winner...
        </div>
      )}

      {game.status === "finished" && (
        <div style={{ color: "lime" }}>
          🏆 Winner: Player {game.winner}
        </div>
      )}
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    textAlign: "center",
    background: "#0f172a",
    color: "white",
    minHeight: "100vh",
    padding: 20,
  },

  boardWrapper: {
    position: "relative",
    width: 360,
    height: 360,
    margin: "20px auto",
  },

  board: {
    width: "100%",
    height: "100%",
  },

  token: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    color: "white",
    border: "2px solid white",
    transition: "0.25s linear",
  },

  info: { marginBottom: 10 },

  controls: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
  },

  dice: {
    width: 55,
    height: 55,
    background: "#1e293b",
    border: "2px solid gold",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    transition: "0.4s",
  },

  button: {
    padding: 12,
    borderRadius: 10,
    background: "gold",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  },

  history: {
    marginTop: 15,
    background: "#111827",
    padding: 10,
    borderRadius: 10,
    maxWidth: 320,
    margin: "10px auto",
    textAlign: "left",
  },
};