import { useEffect, useRef, useState } from "react";
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// keep last 6 moves
function keepLast6(arr, value) {
  const updated = [...(arr || []), value];
  return updated.slice(-6);
}

// board position → screen position
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

// =========================
// MAIN COMPONENT
// =========================
export default function SnakeGame({ gameId, userId }) {
  const [game, setGame] = useState(null);
  const [positions, setPositions] = useState({ A: [1], B: [1] });
  const [turn, setTurn] = useState(null);
  const [dice, setDice] = useState(1);
  const [moving, setMoving] = useState(false);
  const [msg, setMsg] = useState("");

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const res = await databases.getDocument(
        DATABASE_ID,
        GAME,
        gameId
      );

      setGame(res);
      setTurn(res.turn);

      setPositions(
        res.positions
          ? JSON.parse(res.positions)
          : { A: [1], B: [1] }
      );
    }

    load();
  }, [gameId]);

  // =========================
  // EFFECTS
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  // =========================
  // MOVE ANIMATION
  // =========================
  async function move(player, steps) {
    let current = positions[player].slice(-1)[0];

    for (let i = 0; i < steps; i++) {
      await sleep(150);

      current++;
      if (current > SIZE) current = SIZE;

      setPositions((prev) => ({
        ...prev,
        [player]: keepLast6(prev[player], current),
      }));
    }

    const finalPos = applyEffects(current);

    setPositions((prev) => ({
      ...prev,
      [player]: keepLast6(prev[player], finalPos),
    }));

    return finalPos;
  }

  // =========================
  // PLAY TURN (FULL LOCK)
  // =========================
  async function playTurn() {
    if (!game || moving || lock.current) return;

    // 🔒 TURN CHECK (SECURE)
    if (game.turn !== userId) {
      setMsg("❌ Not your turn");
      return;
    }

    if (game.status === "finished") return;

    lock.current = true;
    setMoving(true);

    const d = rollDice();
    setDice(d);

    const player = userId === game.playerA ? "A" : "B";

    const newPos = await move(player, d);

    const winner = newPos >= SIZE ? userId : "";

    const updatedPositions = {
      ...positions,
      [player]: keepLast6(positions[player], newPos),
    };

    const nextTurn =
      game.turn === game.playerA
        ? game.playerB
        : game.playerA;

    const updatedGame = {
      ...game,
      positions: JSON.stringify(updatedPositions),
      turn: nextTurn,
      status: winner ? "finished" : "playing",
      winner,
      history: [
        `Player ${player} rolled ${d}`,
        ...(game.history || []),
      ].slice(0, 6),
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updatedGame
    );

    setGame(updatedGame);
    setPositions(updatedPositions);
    setTurn(nextTurn);

    setMoving(false);
    lock.current = false;
  }

  // =========================
  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  const isMyTurn = game.turn === userId;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN + POT (NO IDS SHOWN) */}
      <div style={styles.info}>
        🎲 Dice: {dice} <br />
        {isMyTurn ? "🟢 Your Turn" : "🔴 Opponent Turn"} <br />
        💰 Pot: ₦{game.pot || 0}
      </div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(
                positions[p]?.slice(-1)[0] || 1
              ),
              background: p === "A" ? "green" : "blue",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* DICE BUTTON */}
      <button
        onClick={playTurn}
        disabled={!isMyTurn || moving || game.status === "finished"}
        style={styles.button}
      >
        {isMyTurn ? "🎲 Roll Dice" : "⛔ Not your turn"}
      </button>

      {/* MESSAGE */}
      {msg && <div style={{ color: "red" }}>{msg}</div>}

      {/* HISTORY (LAST 6 ONLY) */}
      <div style={styles.history}>
        {(game.history || []).map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>

      {/* WINNER */}
      {game.winner && (
        <h3 style={{ color: "gold" }}>
          🏆 Winner: Player {game.winner === game.playerA ? "A" : "B"}
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
    transform: "translate(-50%, -50%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    color: "white",
    border: "2px solid white",
    transition: "0.25s",
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

  history: {
    marginTop: 10,
    fontSize: 12,
    background: "#111",
    padding: 10,
    borderRadius: 10,
  },
};