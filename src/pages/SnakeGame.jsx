import { useEffect, useState, useRef } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const GAME = "snakegame";
const SIZE = 100;

// 🐍 SNAKES
const snakes = {
  50: 5,
  43: 17,
  56: 8,
  68: 15,
  84: 58,
  87: 49,
  98: 40,
};

// 🪜 LADDERS
const ladders = {
  2: 23,
  6: 45,
  20: 59,
  57: 96,
  52: 72,
  71: 92,
};

// ===================== HELPERS =====================
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

function safeParse(data, fallback) {
  if (!data) return fallback;
  try {
    return typeof data === "object" ? data : JSON.parse(data);
  } catch {
    return fallback;
  }
}

// keep last 6 moves only
function keepLast6(arr, value) {
  const updated = [...(arr || []), value];
  return updated.slice(-6);
}

// ===================== GAME =====================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");

  const [dice, setDice] = useState(1);
  const [moving, setMoving] = useState(false);

  const [error, setError] = useState("");
  const [winner, setWinner] = useState("");

  const [pot, setPot] = useState(0);

  // winner animation
  const [showWin, setShowWin] = useState(false);

  // ===================== LOAD USER =====================
  useEffect(() => {
    async function loadUser() {
      const u = await databases.getDocument; // placeholder safety
      try {
        const res = await fetch("/api/me");
        const data = await res.json();
        setUserId(data.$id);
      } catch {}
    }
    loadUser();
  }, []);

  // ===================== LOAD GAME =====================
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      try {
        const res = await databases.getDocument(
          DATABASE_ID,
          GAME,
          gameId
        );

        const parsedPos = safeParse(res.positions, { A: 1, B: 1 });

        setGame(res);
        setPositions(parsedPos);
        setTurn(res.turn || "A");
        setPot(res.pot || 0);
      } catch (err) {
        console.log(err);
      }
    }

    load();
  }, [gameId]);

  // ===================== APPLY EFFECTS =====================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  // ===================== MOVE ANIMATION =====================
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

    const finalPos = applyEffects(current);

    setPositions((prev) => ({
      ...prev,
      [player]: finalPos,
    }));

    return finalPos;
  }

  // ===================== TURN CHECK =====================
  function isMyTurn() {
    return game?.turn === userId;
  }

  function lockError(msg) {
    setError(msg);
    setTimeout(() => setError(""), 1500);
  }

  // ===================== PLAY =====================
  async function playTurn() {
    if (!game || moving) return;

    if (!isMyTurn()) {
      return lockError("❌ Not your turn");
    }

    setMoving(true);

    const d = rollDice();
    setDice(d);

    let newPos = await move(game.turn, d);

    const updated = {
      ...positions,
      [game.turn]: newPos,
    };

    const isWin = newPos >= SIZE;

    const nextTurn = game.turn === "A" ? "B" : "A";

    const updatedGame = {
      ...game,
      positions: JSON.stringify(updated),
      turn: nextTurn,
      winner: isWin ? game.turn : "",
      status: isWin ? "finished" : "playing",
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updatedGame
    );

    setGame(updatedGame);
    setTurn(nextTurn);

    if (isWin) {
      setWinner(game.turn);
      setShowWin(true);

      setTimeout(() => setShowWin(false), 3000);
    }

    setMoving(false);
  }

  // ===================== UI =====================
  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake & Ladder</h2>

      {/* ERROR */}
      {error && <div style={styles.error}>{error}</div>}

      {/* TURN + DICE */}
      <div style={styles.info}>
        🎲 Dice: {dice}
        <br />
        Turn:{" "}
        <b style={{ color: game.turn === "A" ? "lime" : "deepskyblue" }}>
          Player {game.turn}
        </b>
      </div>

      {/* POT */}
      <div style={{ marginBottom: 10 }}>
        🏦 Pot: ₦{pot}
      </div>

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
        disabled={moving || !isMyTurn() || game.status === "finished"}
        style={styles.button}
      >
        🎲 Roll Dice
      </button>

      {/* WIN POPUP */}
      {showWin && (
        <div style={styles.winBox}>
          🏆 Player {winner} WON! <br />
          💰 ₦{pot}
        </div>
      )}

      {/* HISTORY (LAST 6 ONLY) */}
      <div style={styles.history}>
        <b>Last Moves</b>
        <div>
          A: {positions.A}
        </div>
        <div>
          B: {positions.B}
        </div>
      </div>
    </div>
  );
}

// ===================== STYLES =====================
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
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    color: "white",
    border: "2px solid white",
    transition: "0.3s",
  },

  button: {
    padding: 12,
    borderRadius: 10,
    background: "gold",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: 10,
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
    transform: "translate(-50%,-50%)",
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