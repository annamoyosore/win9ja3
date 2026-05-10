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

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// =========================
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({
    A: 1,
    B: 1,
  });

  const [turn, setTurn] = useState("A");
  const [dice, setDice] = useState(1);
  const [moving, setMoving] = useState(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    load();
  }, [gameId]);

  async function load() {
    const res = await databases.getDocument(
      DATABASE_ID,
      GAME,
      gameId
    );

    setGame(res);

    try {
      const parsed = JSON.parse(res.positions);
      setPositions(parsed);
    } catch {
      setPositions({ A: 1, B: 1 });
    }

    setTurn(res.turn || "A");
  }

  // =========================
  // APPLY SNAKE / LADDER
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  // =========================
  // PLAY TURN (FIXED FLOW)
  // =========================
  async function playTurn() {
    if (!game || moving || game.status === "finished") return;

    setMoving(true);

    const diceValue = rollDice();
    setDice(diceValue);

    const player = turn;

    let current = positions[player];

    // =========================
    // 1. MOVE FIRST (ANIMATION)
    // =========================
    for (let i = 0; i < diceValue; i++) {
      await sleep(120);

      current += 1;
      if (current > SIZE) current = SIZE;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    // =========================
    // 2. APPLY SNAKE/LADDER
    // =========================
    const finalPos = applyEffects(current);

    setPositions((prev) => ({
      ...prev,
      [player]: finalPos,
    }));

    // =========================
    // 3. CHECK WINNER
    // =========================
    const winner = finalPos >= SIZE ? player : "";

    // =========================
    // 4. SAVE TO BACKEND (ONLY AFTER MOVE)
    // =========================
    const updated = {
      ...game,
      positions: JSON.stringify({
        ...positions,
        [player]: finalPos,
      }),
      turn: player === "A" ? "B" : "A",
      status: winner ? "finished" : "playing",
      winner,
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updated
    );

    setGame(updated);
    setTurn(updated.turn);

    setMoving(false);
  }

  // =========================
  // GET POSITION
  // =========================
  const getPos = (p) => positions[p];

  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN INDICATOR (NO USER ID) */}
      <div style={styles.turn}>
        Turn:{" "}
        <b style={{ color: turn === "A" ? "lime" : "deepskyblue" }}>
          Player {turn}
        </b>
      </div>

      {/* DICE */}
      <div style={styles.dice}>🎲 {dice}</div>

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

  turn: {
    marginBottom: 10,
    fontSize: 18,
  },

  dice: {
    fontSize: 40,
    marginBottom: 10,
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

  button: {
    padding: 12,
    borderRadius: 10,
    background: "gold",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  },
};