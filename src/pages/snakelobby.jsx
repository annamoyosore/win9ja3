import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID
} from "../lib/appwrite";

// =========================
// COLLECTION
// =========================
const SNAKE_GAME_COLLECTION = "snakegame";

// =========================
// SAFE PARSE
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

// =========================
// BOARD COORDS
// =========================
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gameId) return;

    loadGame();
  }, [gameId]);

  async function loadGame() {
    try {
      const u = await account.get();
      setUser(u);

      const res = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      setGame(res);
    } catch (err) {
      console.log(err);
      setError("Failed to load game");
    }
  }

  // =========================
  // ROLE DETECTION (A / B ONLY)
  // =========================
  function getRole() {
    if (!game || !user) return null;

    const players = safeParse(game.players, []);

    if (players[0] === user.$id) return "A";
    if (players[1] === user.$id) return "B";

    return null;
  }

  const role = getRole();

  if (error) {
    return (
      <div style={{ color: "red", padding: 20 }}>
        {error}
      </div>
    );
  }

  if (!game) {
    return (
      <div style={{ color: "white", padding: 20 }}>
        Loading Snake Game...
      </div>
    );
  }

  const positions = safeParse(game.positions, {
    A: 1,
    B: 1
  });

  const isMyTurn = game.turn === role;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* =========================
          TURN INDICATOR
      ========================= */}
      <div
        style={{
          ...styles.turnBox,
          background: isMyTurn ? "#22c55e" : "#3b82f6"
        }}
      >
        {isMyTurn ? "🟢 YOUR TURN" : "🔵 OPPONENT TURN"}
      </div>

      {/* =========================
          BOARD
      ========================= */}
      <div style={styles.boardWrapper}>
        {/* 🔥 FIXED IMAGE PATH */}
        <img src="/board.png" style={styles.board} />

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
                  : "translate(-50%, -50%)"
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* =========================
          STATUS
      ========================= */}
      <div style={styles.info}>
        Turn: {game.turn} <br />
        Status: {game.status}
      </div>

      {/* =========================
          BUTTON
      ========================= */}
      <button
        disabled={!isMyTurn}
        style={{
          ...styles.button,
          opacity: isMyTurn ? 1 : 0.5
        }}
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
    padding: 10,
    borderRadius: 10,
    fontWeight: "bold",
    marginBottom: 10,
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
    height: "100%",
    objectFit: "contain"
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

  info: {
    marginTop: 10
  },

  button: {
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "#f59e0b",
    fontWeight: "bold"
  }
};