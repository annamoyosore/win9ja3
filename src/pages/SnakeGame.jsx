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

// =========================
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [positions, setPositions] = useState({ A: 1, B: 1 });
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

    const parsedPos = safeParse(res.positions, { A: 1, B: 1 });

    setGame(res);
    setPositions(parsedPos);
    setTurn(res.turn || "A");
  }

  // =========================
  // EFFECTS (SNAKE / LADDER)
  // =========================
  function applyEffects(pos) {
    let current = pos;

    while (snakes[current] || ladders[current]) {
      if (snakes[current]) current = snakes[current];
      if (ladders[current]) current = ladders[current];
    }

    return current;
  }

  // =========================
  // MAIN TURN LOGIC (FIXED SECURITY + SYNC)
  // =========================
  async function playTurn() {
    if (!game || moving || game.status === "finished") return;

    setMoving(true);

    // 🔥 ALWAYS FETCH LATEST GAME (CRITICAL FIX)
    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME,
      gameId
    );

    // 🔒 TURN VALIDATION (NO CHEATING)
    if (fresh.turn !== turn) {
      alert("Not your turn");
      setMoving(false);
      return;
    }

    const player = fresh.turn;
    const diceValue = rollDice();
    setDice(diceValue);

    let current = safeParse(fresh.positions, { A: 1, B: 1 })[player];

    // 🎮 ANIMATE MOVEMENT FIRST
    for (let i = 0; i < diceValue; i++) {
      await sleep(120);
      current += 1;
      if (current > SIZE) current = SIZE;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    // 🐍 APPLY SNAKES/LADDERS
    const finalPos = applyEffects(current);

    const updatedPositions = {
      ...safeParse(fresh.positions, { A: 1, B: 1 }),
      [player]: finalPos,
    };

    // 🏁 CHECK WINNER
    const winner = finalPos >= SIZE ? player : "";

    const nextTurn = player === "A" ? "B" : "A";

    // 💾 SAVE TO BACKEND (SOURCE OF TRUTH)
    const updatedGame = {
      ...fresh,
      positions: JSON.stringify(updatedPositions),
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

    // 🔄 UPDATE LOCAL STATE
    setGame(updatedGame);
    setPositions(updatedPositions);
    setTurn(nextTurn);

    setMoving(false);
  }

  // =========================
  // GET POSITION
  // =========================
  const getPos = (p) => positions[p] || 1;

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.info}>
        🎲 Dice: {dice} <br />
        Turn:{" "}
        <b style={{ color: turn === "A" ? "lime" : "deepskyblue" }}>
          Player {turn}
        </b>
      </div>

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

      <button
        onClick={playTurn}
        disabled={moving || game.status === "finished"}
        style={styles.button}
      >
        🎲 Roll Dice
      </button>

      {game.winner && (
        <h3 style={{ color: "gold" }}>
          🏆 Winner: Player {game.winner}
        </h3>
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
  button: {
    padding: 12,
    borderRadius: 10,
    background: "gold",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  },
};