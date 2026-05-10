import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID
} from "../lib/appwrite";

import boardImg from "./board.png";

const SNAKE_GAME_COLLECTION = "snakegame";
const SIZE = 100;

// =========================
// HELPERS
// =========================
function safeParse(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

function getCoords(pos = 1) {
  const index = pos - 1;
  const row = Math.floor(index / 10);
  let col = index % 10;

  if (row % 2 === 1) col = 9 - col;

  return {
    left: `${col * 10 + 5}%`,
    top: `${(9 - row) * 10 + 5}%`
  };
}

// =========================
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    init();
  }, [gameId]);

  async function init() {
    const u = await account.get();
    setUser(u);

    const res = await databases.getDocument(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION,
      gameId
    );

    setGame(res);
  }

  // =========================
  // TURN LABEL LOGIC
  // =========================
  function getPlayerRole() {
    if (!game || !user) return null;

    const players = safeParse(game.players, []);
    const index = players.indexOf(user.$id);

    if (index === 0) return "A";
    if (index === 1) return "B";

    return null;
  }

  const myRole = getPlayerRole();

  const positions = safeParse(game?.positions, { A: 1, B: 1 });

  const isMyTurn = game?.turn === myRole;
  const isOpponentTurn = game?.turn && game.turn !== myRole;

  // =========================
  // UI
  // =========================
  if (!game) return <div>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* =========================
          TURN INDICATOR (FIXED)
      ========================= */}
      <div style={styles.turnBox}>
        <div
          style={{
            ...styles.turnIndicator,
            background: isMyTurn ? "#22c55e" : "#1e3a8a",
            boxShadow: isMyTurn
              ? "0 0 20px #22c55e"
              : "0 0 20px #3b82f6"
          }}
        >
          {isMyTurn ? "🟢 YOUR TURN" : "🔵 OPPONENT TURN"}
        </div>
      </div>

      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        {/* PLAYER TOKENS */}
        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(positions[p]),
              background: p === "A" ? "#ef4444" : "#3b82f6",
              transform:
                game.turn === p
                  ? "translate(-50%, -50%) scale(1.4)"
                  : "translate(-50%, -50%)",
              boxShadow:
                game.turn === p
                  ? "0 0 15px white"
                  : "none"
            }}
          >
            {p}
          </div>
        ))}
      </div>

      <button
        style={{
          ...styles.button,
          opacity: isMyTurn ? 1 : 0.4,
          cursor: isMyTurn ? "pointer" : "not-allowed"
        }}
        disabled={!isMyTurn}
      >
        🎲 Roll Dice
      </button>
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
    padding: 20
  },

  turnBox: {
    marginBottom: 10
  },

  turnIndicator: {
    padding: 10,
    borderRadius: 10,
    fontWeight: "bold",
    transition: "0.3s"
  },

  boardWrapper: {
    position: "relative",
    width: 360,
    height: 360,
    margin: "20px auto"
  },

  board: {
    width: "100%",
    height: "100%"
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
    transition: "0.3s"
  },

  button: {
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    border: "none",
    fontWeight: "bold",
    background: "#f59e0b"
  }
};