import { useEffect, useState, useRef } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const GAME = "snakegame";
const SIZE = 100;

// =====================
// SNAKES & LADDERS
// =====================
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

// =====================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function safeParse(data, fallback) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data || fallback;
  } catch {
    return fallback;
  }
}

// last 6 moves
function keepLast6(arr, value) {
  return [...(arr || []), value].slice(-6);
}

// =====================
// BOARD POSITION
// =====================
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

// =====================
// MAIN GAME
// =====================
export default function SnakeGame({ gameId, userId }) {
  const [game, setGame] = useState(null);
  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [dice, setDice] = useState(1);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  const [winner, setWinner] = useState("");
  const [showWin, setShowWin] = useState(false);

  const lock = useRef(false);

  // =====================
  // LOAD GAME
  // =====================
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const res = await databases.getDocument(
        DATABASE_ID,
        GAME,
        gameId
      );

      setGame(res);
      setPositions(safeParse(res.positions, { A: 1, B: 1 }));
    }

    load();
  }, [gameId]);

  // =====================
  // CHECK TURN (STRICT)
  // =====================
  function isMyTurn() {
    return game?.turn === userId;
  }

  function showError(msg) {
    setError(msg);
    setTimeout(() => setError(""), 1500);
  }

  // =====================
  // MOVE PIECE
  // =====================
  async function move(player, steps) {
    let current = positions[player];

    for (let i = 0; i < steps; i++) {
      await sleep(120);
      current += 1;
      if (current > SIZE) current = SIZE;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    let final = current;

    if (snakes[final]) final = snakes[final];
    if (ladders[final]) final = ladders[final];

    setPositions((prev) => ({
      ...prev,
      [player]: final,
    }));

    return final;
  }

  // =====================
  // PLAY TURN (LOCKED)
  // =====================
  async function playTurn() {
    if (!game || moving || lock.current) return;

    // 🔒 HARD TURN LOCK
    if (!isMyTurn()) {
      return showError("❌ Not your turn");
    }

    lock.current = true;
    setMoving(true);

    const d = rollDice();
    setDice(d);

    const player = game.turn === game.playerA ? "A" : "B";

    const newPos = await move(player, d);

    const isWin = newPos >= SIZE;

    const nextTurn =
      game.turn === game.playerA
        ? game.playerB
        : game.playerA;

    const updated = {
      ...game,
      positions: JSON.stringify({
        ...positions,
        [player]: newPos,
      }),
      turn: nextTurn,
      status: isWin ? "finished" : "playing",
      winner: isWin ? game.turn : "",
      history: [
        `Player ${player} rolled ${d}`,
        ...(game.history || []),
      ].slice(0, 6),
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updated
    );

    setGame(updated);

    if (isWin) {
      setWinner(player);
      setShowWin(true);

      setTimeout(() => setShowWin(false), 3000);
    }

    setMoving(false);
    lock.current = false;
  }

  // =====================
  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  const isTurn = isMyTurn();

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN */}
      <div style={styles.info}>
        🎲 Dice: {dice}
        <br />
        {isTurn ? "🟢 Your Turn" : "🔴 Opponent Turn"}
      </div>

      {/* ERROR */}
      {error && <div style={styles.error}>{error}</div>}

      {/* BOARD */}
      <div style={styles.board}>
        <img src={boardImg} style={{ width: "100%", height: "100%" }} />

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
        disabled={!isTurn || moving || game.status === "finished"}
        style={styles.button}
      >
        🎲 Roll Dice
      </button>

      {/* WIN POPUP */}
      {showWin && (
        <div style={styles.winBox}>
          🏆 Player {winner} WON!
        </div>
      )}

      {/* HISTORY */}
      <div style={styles.history}>
        {(game.history || []).map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>
    </div>
  );
}

// =====================
const styles = {
  container: {
    textAlign: "center",
    background: "#0f172a",
    color: "white",
    minHeight: "100vh",
    padding: 20,
  },

  board: {
    position: "relative",
    width: 360,
    height: 360,
    margin: "20px auto",
  },

  token: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    color: "white",
    fontWeight: "bold",
    border: "2px solid white",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  button: {
    padding: 12,
    borderRadius: 10,
    background: "gold",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  },

  info: {
    marginBottom: 10,
  },

  error: {
    background: "red",
    padding: 8,
    marginBottom: 10,
    borderRadius: 6,
  },

  winBox: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "gold",
    color: "#000",
    padding: 20,
    borderRadius: 12,
    fontWeight: "bold",
    fontSize: 18,
  },

  history: {
    marginTop: 15,
    background: "#111",
    padding: 10,
    borderRadius: 10,
  },
};