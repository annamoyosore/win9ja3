import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query,
} from "../lib/appwrite";

import boardImg from "./board.png";

const SNAKE_GAME_COLLECTION = "snakegame";
const SNAKE_LOBBY_COLLECTION = "snakelobby";
const WALLET_COLLECTION = "wallets";

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

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function applyEffects(pos) {
  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

// =========================
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({
    host: 1,
    opponent: 1,
  });

  const [turn, setTurn] = useState("host");
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function init() {
      try {
        const u = await account.get();
        setUser(u);

        const res = await databases.getDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId
        );

        setGame(res);

        setTurn(res.turn || "host");

        setPositions(
          JSON.parse(res.positions || '{"host":1,"opponent":1}')
        );
      } catch (err) {
        console.error(err);
      }
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME SYNC
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${SNAKE_GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const payload = res.payload;

        setGame(payload);

        // FIX: never allow undefined turn
        setTurn(payload.turn || "host");

        setPositions(
          JSON.parse(payload.positions || '{"host":1,"opponent":1}')
        );
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // ROLE DETECTION (FIXED)
  // =========================
  function myRole() {
    if (!user || !game) return null;

    if (!game.hostId || !game.opponentId) return null;

    if (user.$id === game.hostId) return "host";
    if (user.$id === game.opponentId) return "opponent";

    return null;
  }

  const role = myRole();

  // FIX: stable turn check
  const isMyTurn =
    role &&
    game?.turn &&
    game.turn === role;

  // =========================
  // MOVE ANIMATION
  // =========================
  async function animateMove(player, start, end) {
    let current = start;

    while (current < end) {
      await sleep(120);
      current++;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    return applyEffects(current);
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || !user || rolling || lock.current) return;

    // FIX: block correctly
    if (!isMyTurn) return;

    lock.current = true;
    setRolling(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      const role =
        user.$id === fresh.hostId ? "host" : "opponent";

      const positionsData = JSON.parse(
        fresh.positions || '{"host":1,"opponent":1}'
      );

      const start = positionsData[role];

      const d = rollDice();
      setDice(d);

      let end = start + d;
      if (end > SIZE) end = SIZE;

      const finalPos = await animateMove(role, start, end);

      const corrected = applyEffects(finalPos);

      const winner = corrected >= SIZE ? role : null;

      // FIX: stable turn switching
      const nextTurn = fresh.turn === "host" ? "opponent" : "host";

      const updated = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...positionsData,
            [role]: corrected,
          }),

          turn: winner ? null : nextTurn,

          status: winner ? "finished" : "running",

          winner: winner || "",
        }
      );

      setGame(updated);
      setTurn(updated.turn || "host");

      setPositions(JSON.parse(updated.positions));

      // ================= WIN =================
      if (winner) {
        const pot = Number(fresh.pot || 0);

        const winnerId =
          role === "host" ? fresh.hostId : fresh.opponentId;

        await payout(winnerId, pot);

        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          fresh.lobbyId,
          {
            status: "finished",
          }
        );

        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      setTimeout(() => (lock.current = false), 300);
    }
  }

  // =========================
  // SAFE LOADING GUARD
  // =========================
  if (!game || !user) {
    return <div style={{ color: "#fff" }}>Loading...</div>;
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN DISPLAY (FIXED - NEVER BOTH "OPPONENT TURN") */}
      <div style={styles.turnBox}>
        {isMyTurn ? "🎯 Your Turn" : "⏳ Opponent Turn"}
      </div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        <div
          style={{
            ...styles.token,
            ...getCoords(positions.host),
            background: "red",
          }}
        />

        <div
          style={{
            ...styles.token,
            ...getCoords(positions.opponent),
            background: "blue",
          }}
        />
      </div>

      {/* CONTROLS */}
      <div style={styles.controls}>
        <button
          onClick={playTurn}
          disabled={!isMyTurn || rolling}
        >
          {rolling ? "Rolling..." : "🎲 Roll Dice"}
        </button>

        <div style={styles.dice}>{dice}</div>
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

  turnBox: {
    margin: 10,
    fontSize: 18,
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
    width: 26,
    height: 26,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
  },

  controls: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
  },

  dice: {
    padding: 10,
    background: "#1e293b",
    borderRadius: 8,
  },
};