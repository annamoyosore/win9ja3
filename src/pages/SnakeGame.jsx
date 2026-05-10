import { useEffect, useState, useRef } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const GAME_COLLECTION = "snakegame";
const MATCH_COLLECTION = "snakelobby";
const WALLET_COLLECTION = "wallets";

const SIZE = 100;

// 🐍 RULES
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

function safeParse(v, fallback) {
  if (!v) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function applyEffects(pos) {
  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

// =========================
// MAIN COMPONENT
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");

  const [dice, setDice] = useState(1);
  const [moving, setMoving] = useState(false);
  const [rolling, setRolling] = useState(false);

  const actionLock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const res = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      setGame(res);

      setPositions(safeParse(res.positions, { A: 1, B: 1 }));
      setTurn(res.turn || "A");

      if (res.matchId) {
        const m = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          res.matchId
        );
        setMatch(m);
      }
    }

    load();
  }, [gameId]);

  // =========================
  // TURN CHECK (CRITICAL FIX)
  // =========================
  function canPlay(player) {
    return game?.turn === player && game?.status !== "finished";
  }

  // =========================
  // MOVE ANIMATION
  // =========================
  async function movePiece(player, steps) {
    let current = positions[player];

    for (let i = 0; i < steps; i++) {
      await sleep(200);
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

  // =========================
  // PLAY TURN (HARDENED)
  // =========================
  async function playTurn() {
    const player = turn;

    if (!game || moving || rolling) return;

    if (!canPlay(player)) {
      alert("❌ Not your turn");
      return;
    }

    if (actionLock.current) return;

    actionLock.current = true;

    setMoving(true);
    setRolling(true);

    // 🎲 roll animation
    let d = 1;
    for (let i = 0; i < 10; i++) {
      d = rollDice();
      setDice(d);
      await sleep(80);
    }

    setRolling(false);

    const finalPos = await movePiece(player, d);

    const winner = finalPos >= SIZE ? player : null;

    const newTurn = player === "A" ? "B" : "A";

    const updated = {
      ...game,
      positions: {
        ...positions,
        [player]: finalPos,
      },
      turn: winner ? null : newTurn,
      status: winner ? "finished" : "playing",
      winner: winner || "",
      history: [
        `Player ${player} rolled ${d} → ${finalPos}`,
        ...(game.history || []),
      ].slice(0, 6),
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      updated
    );

    setGame(updated);
    setTurn(updated.turn);

    setMoving(false);
    actionLock.current = false;
  }

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake & Ladder</h2>

      {/* TURN + POT */}
      <div style={styles.top}>
        <div>🎲 Dice: {dice}</div>

        <div>
          Turn:{" "}
          <b>{turn === "A" ? "Player A" : "Player B"}</b>
        </div>

        <div>🏦 Pot: ₦{match?.pot || 0}</div>
      </div>

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

      {/* BUTTON + DICE */}
      <div style={styles.controls}>
        <button
          onClick={playTurn}
          disabled={moving || rolling || game.status === "finished"}
        >
          🎲 Roll Dice
        </button>

        <div style={styles.dice}>{dice}</div>
      </div>

      {/* WINNER */}
      {game.status === "finished" && (
        <div style={styles.win}>
          🏆 {game.winner === "A" ? "Player A" : "Player B"} Wins ₦
          {match?.pot || 0}
        </div>
      )}

      {/* HISTORY */}
      <div style={styles.history}>
        {game.history?.slice(0, 6).map((h, i) => (
          <div key={i}>{h}</div>
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
    color: "#fff",
    minHeight: "100vh",
    padding: 15,
  },

  top: {
    display: "flex",
    justifyContent: "space-around",
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
    color: "#fff",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  controls: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },

  dice: {
    fontSize: 28,
    padding: "5px 10px",
    background: "#111",
    borderRadius: 8,
  },

  win: {
    marginTop: 10,
    color: "gold",
    fontWeight: "bold",
    fontSize: 18,
  },

  history: {
    marginTop: 10,
    fontSize: 12,
    maxHeight: 120,
    overflowY: "auto",
    background: "#111",
    padding: 8,
    borderRadius: 8,
  },
};