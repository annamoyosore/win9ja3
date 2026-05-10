import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
} from "../lib/appwrite";

import boardImg from "./board.png";

const SNAKE_GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

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
function getCoords(pos = 1) {
  const index = pos - 1;
  const row = Math.floor(index / 10);
  let col = index % 10;

  if (row % 2 === 1) col = 9 - col;

  return {
    left: `${col * 10 + 5}%`,
    top: `${(9 - row) * 10 + 5}%`,
  };
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSafe(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

// =========================
// GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const load = async () => {
      const res = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );
      setGame(res);
    };

    load();

    const interval = setInterval(load, 2000); // live sync
    return () => clearInterval(interval);
  }, [gameId]);

  // =========================
  // EFFECTS
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  function nextTurn(turn) {
    return turn === "A" ? "B" : "A";
  }

  async function move(player, steps, positions) {
    let current = positions[player] || 1;

    for (let i = 0; i < steps; i++) {
      await sleep(120);
      current++;
      if (current > SIZE) current = SIZE;
    }

    return applyEffects(current);
  }

  // =========================
  // DICE ANIMATION
  // =========================
  async function animateDice() {
    setRolling(true);

    for (let i = 0; i < 10; i++) {
      setDice(Math.floor(Math.random() * 6) + 1);
      await sleep(70);
    }

    setRolling(false);
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || moving || rolling) return;
    if (game.status === "finished") return;

    setMoving(true);

    await animateDice();

    const d = rollDice();
    setDice(d);

    const player = game.turn;

    const positions = parseSafe(game.positions, { A: 1, B: 1 });
    const history = parseSafe(game.history, []);

    const newPos = await move(player, d, positions);

    const updatedPositions = {
      ...positions,
      [player]: newPos,
    };

    let winner = "";
    if (newPos >= SIZE) winner = player;

    const newHistory = [
      {
        player: player === "A" ? "Player A" : "Player B",
        dice: d,
        from: positions[player],
        to: newPos,
      },
      ...history,
    ].slice(0, 6);

    const updatedGame = {
      ...game,
      positions: updatedPositions,
      turn: nextTurn(player),
      status: winner ? "finished" : "playing",
      winner,
      history: newHistory,
    };

    await databases.updateDocument(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION,
      gameId,
      updatedGame
    );

    setGame(updatedGame);
    setMoving(false);
  }

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  const positions = parseSafe(game.positions, { A: 1, B: 1 });

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN INDICATOR */}
      <div style={styles.turn}>
        {game.status === "finished" ? (
          <b>🏆 Winner: {game.winner === "A" ? "Player A" : "Player B"}</b>
        ) : (
          <b>
            Turn:{" "}
            <span style={{ color: game.turn === "A" ? "lime" : "deepskyblue" }}>
              {game.turn === "A" ? "Player A 🟢" : "Player B 🔵"}
            </span>
          </b>
        )}
      </div>

      {/* DICE */}
      <div style={styles.dice}>{dice}</div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(positions[p]),
              background: p === "A" ? "red" : "blue",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* BUTTON */}
      <button
        onClick={playTurn}
        disabled={moving || rolling || game.status === "finished"}
        style={styles.button}
      >
        🎲 Roll Dice
      </button>

      {/* HISTORY */}
      <div style={styles.history}>
        <h4>Last Moves</h4>
        {parseSafe(game.history, []).map((h, i) => (
          <div key={i}>
            {h.player} rolled {h.dice}: {h.from} → {h.to}
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
  },
  dice: {
    fontSize: 40,
    margin: 10,
  },
  turn: {
    marginBottom: 10,
  },
  button: {
    padding: "12px 20px",
    borderRadius: 10,
    border: "none",
    background: "gold",
    fontWeight: "bold",
    cursor: "pointer",
  },
  history: {
    marginTop: 15,
    background: "#111827",
    padding: 10,
    borderRadius: 10,
    maxWidth: 320,
    marginLeft: "auto",
    marginRight: "auto",
    textAlign: "left",
  },
};