import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  Query,
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

function keepLast6(arr, value) {
  return [...(arr || []), value].slice(-6);
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
  const [error, setError] = useState("");

  // 💰 POT
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
  // APPLY SNAKES/LADDERS
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

    return new Promise((resolve) => {
      let count = 0;

      const interval = setInterval(() => {
        setDice(Math.floor(Math.random() * 6) + 1);
        count++;

        if (count > 12) {
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
  // PAYOUT SYSTEM
  // =========================
  async function handleWin(winner, gameData) {
    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      {
        status: "ending",
        winner,
        pot: gameData.pot,
      }
    );

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
          const walletRes = await databases.listDocuments(
            DATABASE_ID,
            WALLET,
            [Query.equal("userId", winner)]
          );

          if (walletRes.documents.length) {
            const w = walletRes.documents[0];

            await databases.updateDocument(
              DATABASE_ID,
              WALLET,
              w.$id,
              {
                balance:
                  Number(w.balance || 0) + Number(gameData.pot || 0),
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
              payoutDone: true,
            }
          );

          setGame((prev) => ({
            ...prev,
            status: "finished",
          }));
        } catch (err) {
          console.log(err);
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
    setError("");

    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME,
      gameId
    );

    const player = fresh.turn;

    // 🔒 TURN LOCK CHECK
    if (!player) {
      setMoving(false);
      return;
    }

    const diceValue = await rollDiceAnim();

    let pos = safeParse(fresh.positions, { A: 1, B: 1 });
    let current = pos[player];

    for (let i = 0; i < diceValue; i++) {
      await sleep(120);
      current++;
      if (current > SIZE) current = SIZE;
      setPositions((p) => ({ ...p, [player]: current }));
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

    const updatedGame = {
      ...fresh,
      positions: JSON.stringify(pos),
      history: JSON.stringify(newHistory),
      turn: nextTurn,
      status: winner ? "ending" : "playing",
      winner,
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updatedGame
    );

    setGame(updatedGame);
    setPositions(pos);
    setTurn(nextTurn);
    setHistory(newHistory);

    if (winner) {
      await handleWin(winner, updatedGame);
    }

    setMoving(false);
  }

  const getPos = (p) => positions[p] || 1;

  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN + DICE */}
      <div style={styles.info}>
        🎲 Dice: {dice} <br />
        Turn:{" "}
        <b style={{ color: turn === "A" ? "lime" : "deepskyblue" }}>
          Player {turn}
        </b>
      </div>

      {/* 💰 POT */}
      <div style={styles.pot}>
        💰 Pot: ₦{pot}
      </div>

      {/* STATUS */}
      {game.status === "ending" && (
        <div style={{ color: "gold" }}>
          ⏳ Paying winner... {game.countdown || 5}
        </div>
      )}

      {game.status === "finished" && (
        <div style={{ color: "lime", fontSize: 18 }}>
          🏆 YOU WON: Player {game.winner}
        </div>
      )}

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

      {/* BUTTON */}
      <button
        onClick={playTurn}
        disabled={moving || rolling || game.status !== "playing"}
        style={styles.button}
      >
        {rolling ? "Rolling..." : "🎲 Roll Dice"}
      </button>

      {/* HISTORY */}
      <div style={styles.history}>
        <h4>Last 6 Moves</h4>
        {history.map((h, i) => (
          <div key={i}>
            {h.player} 🎲{h.dice}: {h.from} → {h.to}
          </div>
        ))}
      </div>
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

  pot: {
    marginBottom: 10,
    color: "#facc15",
    fontWeight: "bold",
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