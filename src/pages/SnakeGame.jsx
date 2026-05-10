import { useEffect, useState } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
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
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");

  // 💰 POT DISPLAY
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

    const parsedPos = safeParse(res.positions, { A: 1, B: 1 });
    const parsedHist = safeParse(res.history, []);

    setGame(res);
    setPositions(parsedPos);
    setHistory(parsedHist.slice(-6));
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
  // TURN SYSTEM
  // =========================
  async function playTurn() {
    if (!game || moving || game.status === "finished") return;

    setError("");
    setMoving(true);

    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME,
      gameId
    );

    if (fresh.turn !== turn) {
      setError("🚫 Not your turn");
      setTimeout(() => setError(""), 2000);
      setMoving(false);
      return;
    }

    const player = fresh.turn;
    const diceValue = rollDice();
    setDice(diceValue);

    let current = safeParse(fresh.positions, { A: 1, B: 1 })[player];

    for (let i = 0; i < diceValue; i++) {
      await sleep(120);
      current += 1;
      if (current > SIZE) current = SIZE;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    const finalPos = applyEffects(current);

    const updatedPositions = {
      ...safeParse(fresh.positions, { A: 1, B: 1 }),
      [player]: finalPos,
    };

    const moveEntry = {
      player: player === "A" ? "Player A" : "Player B",
      dice: diceValue,
      from: current,
      to: finalPos,
    };

    const updatedHistory = keepLast6(
      safeParse(fresh.history, []),
      moveEntry
    );

    const winner = finalPos >= SIZE ? player : "";
    const nextTurn = player === "A" ? "B" : "A";

    const updatedGame = {
      ...fresh,
      positions: JSON.stringify(updatedPositions),
      history: JSON.stringify(updatedHistory),
      turn: nextTurn,
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
    setHistory(updatedHistory);
    setTurn(nextTurn);

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

      {/* 💰 POT DISPLAY */}
      <div style={styles.potBox}>
        💰 Pot: ₦{pot.toLocaleString()} <br />
        🏆 Winner Gets: ₦{pot.toLocaleString()}
      </div>

      {/* ERROR */}
      {error && <div style={styles.popup}>{error}</div>}

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
        disabled={moving || game.status === "finished" || game.turn !== turn}
        style={{
          ...styles.button,
          opacity: moving || game.turn !== turn ? 0.5 : 1,
        }}
      >
        {game.turn !== turn ? "🚫 Not Your Turn" : "🎲 Roll Dice"}
      </button>

      {/* WINNER */}
      {game.winner && (
        <h3 style={{ color: "gold" }}>
          🏆 Winner: Player {game.winner}
        </h3>
      )}

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
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    color: "white",
    border: "2px solid white",
    transform: "translate(-50%, -50%)",
    transition: "0.25s linear",
  },

  info: {
    marginBottom: 10,
  },

  potBox: {
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
    background: "#1e293b",
    borderRadius: 10,
    fontWeight: "bold",
    color: "#facc15",
    width: 260,
    marginLeft: "auto",
    marginRight: "auto",
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

  popup: {
    position: "fixed",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#ef4444",
    padding: "10px 20px",
    borderRadius: 10,
    fontWeight: "bold",
    zIndex: 9999,
  },
};