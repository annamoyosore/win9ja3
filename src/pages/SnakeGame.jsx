import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
} from "../lib/appwrite";

import boardImg from "./board.png";

const GAME = "snakegame";
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
  if (!data) return fallback;
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// keep last 3 moves
function keepLast3(arr, value) {
  const updated = [...(arr || []), value];
  return updated.slice(-3);
}

// =========================
// GAME COMPONENT
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [positions, setPositions] = useState({
    A: [1],
    B: [1],
  });

  const [turn, setTurn] = useState("A");
  const [dice, setDice] = useState(1);
  const [moving, setMoving] = useState(false);

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

    const parsed = safeParse(res.positions, {
      A: [1],
      B: [1],
    });

    setPositions(parsed);
    setTurn(res.turn || "A");
  }

  // =========================
  // SNAKE / LADDER APPLY
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  // =========================
  // PLAY TURN (FIXED CORE LOGIC)
  // =========================
  async function playTurn() {
    if (!game || moving) return;

    setMoving(true);

    const diceValue = rollDice();
    setDice(diceValue);

    const player = turn;

    const current =
      positions[player][positions[player].length - 1];

    let next = current + diceValue;

    if (next > SIZE) next = SIZE;

    next = applyEffects(next);

    const updatedHistory = keepLast3(
      positions[player],
      next
    );

    const updatedPositions = {
      ...positions,
      [player]: updatedHistory,
    };

    const winner = next >= SIZE ? player : "";

    const updatedGame = {
      ...game,
      positions: JSON.stringify(updatedPositions),
      turn: player === "A" ? "B" : "A",
      status: winner ? "finished" : "playing",
      winner,
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updatedGame
    );

    setGame(updatedGame);
    setPositions(updatedPositions);
    setTurn(updatedGame.turn);

    setMoving(false);
  }

  // =========================
  // GET CURRENT POSITION
  // =========================
  const getPos = (p) =>
    positions[p]?.[positions[p].length - 1] || 1;

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN */}
      <div style={styles.info}>
        🎲 Dice: {dice} <br />
        Turn:{" "}
        <b style={{ color: turn === "A" ? "lime" : "deepskyblue" }}>
          Player {turn}
        </b>
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
              background: p === "A" ? "red" : "blue",
              transform: "translate(-50%, -50%)",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* BUTTON */}
      <button
        onClick={playTurn}
        disabled={moving || game.status === "finished"}
        style={styles.button}
      >
        🎲 Roll Dice
      </button>

      {/* WINNER */}
      {game.winner && (
        <h3 style={{ color: "gold" }}>
          🏆 Winner: Player {game.winner}
        </h3>
      )}

      {/* LAST 3 MOVES */}
      <div style={styles.history}>
        <h4>Last Moves (A / B)</h4>
        <div>A: {positions.A.join(" → ")}</div>
        <div>B: {positions.B.join(" → ")}</div>
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
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    color: "white",
    border: "2px solid white",
    transition: "0.25s linear",
  },

  info: {
    marginBottom: 10,
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