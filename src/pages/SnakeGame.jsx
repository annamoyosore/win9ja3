import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
} from "../lib/appwrite";

import boardImg from "./board.png";

const GAME_COLLECTION = "snakegame";
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
  52: 72,
  57: 96,
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

function diceRoll() {
  const arr = new Uint8Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 6) + 1;
}

function applyEffects(pos) {
  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

function trimHistory(h = []) {
  return h.slice(0, 3);
}

// =========================
// GAME ROOM
// =========================
export default function SnakeGameRoom({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function init() {
      const u = await account.get();
      setUser(u);

      const res = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      setGame(res);
      setTurn(res.turn || "A");

      setPositions(
        JSON.parse(res.positions || '{"A":1,"B":1}')
      );
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME SYNC
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const g = res.payload;

        setGame(g);
        setTurn(g.turn || "A");

        setPositions(
          JSON.parse(g.positions || '{"A":1,"B":1}')
        );
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // PLAYER IDENTIFICATION
  // =========================
  function myPlayer() {
    if (!user || !game) return null;

    if (game.hostId === user.$id) return "A";
    if (game.opponentId === user.$id) return "B";

    return null;
  }

  const currentPlayer = myPlayer();

  const isMyTurn =
    currentPlayer &&
    turn === currentPlayer &&
    game?.status !== "finished";

  // =========================
  // MOVE ANIMATION
  // =========================
  async function move(player, start, end) {
    let pos = start;

    while (pos < end) {
      await sleep(120);
      pos++;

      setPositions((p) => ({ ...p, [player]: pos }));
    }

    const final = applyEffects(pos);

    setPositions((p) => ({ ...p, [player]: final }));

    return final;
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || !user || rolling || lock.current) return;

    if (!isMyTurn) return;

    lock.current = true;
    setRolling(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const currentTurn = fresh.turn;

      const parsed = JSON.parse(
        fresh.positions || '{"A":1,"B":1}'
      );

      const start = parsed[currentTurn] || 1;

      const roll = diceRoll();
      setDice(roll);

      let end = start + roll;
      if (end > SIZE) end = SIZE;

      const finalPos = await move(currentTurn, start, end);

      const winner = finalPos >= SIZE ? currentTurn : null;

      const nextTurn = currentTurn === "A" ? "B" : "A";

      const updated = await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...parsed,
            [currentTurn]: finalPos,
          }),

          turn: winner ? "FINISHED" : nextTurn,

          status: winner ? "finished" : "running",

          winner: winner || "",

          history: trimHistory([
            `Player ${currentTurn} rolled ${roll} → ${finalPos}`,
            ...(fresh.history || []),
          ]),
        }
      );

      setGame(updated);
      setTurn(updated.turn);

      setPositions(JSON.parse(updated.positions));

      if (winner) {
        alert(`🏆 Player ${winner} wins!`);

        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRolling(false);
      setTimeout(() => (lock.current = false), 400);
    }
  }

  // =========================
  // UI
  // =========================
  if (!game) {
    return <div style={{ color: "#fff" }}>Loading...</div>;
  }

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* CLEAN PLAYERS ONLY (NO WAIT TEXT) */}
      <div style={styles.top}>
        <div>🔴 Player A</div>
        <div>🔵 Player B</div>
      </div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        <div style={{ ...styles.token, ...getCoords(positions.A), background: "red" }}>
          A
        </div>

        <div style={{ ...styles.token, ...getCoords(positions.B), background: "blue" }}>
          B
        </div>
      </div>

      {/* CONTROLS */}
      <button
        onClick={playTurn}
        disabled={!isMyTurn || rolling}
        style={styles.button}
      >
        🎲 Roll Dice
      </button>

      <div style={{ marginTop: 10 }}>🎲 {dice}</div>
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
    fontWeight: "bold",
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
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    color: "#fff",
  },

  button: {
    padding: "12px 18px",
    borderRadius: 10,
    border: "none",
    background: "gold",
    fontWeight: "bold",
    cursor: "pointer",
  },
};