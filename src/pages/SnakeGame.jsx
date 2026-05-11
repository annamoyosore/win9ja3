import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query
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

  const [positions, setPositions] = useState({});
  const [turn, setTurn] = useState(null);

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD USER + GAME
  // =========================
  useEffect(() => {
    async function init() {
      const u = await account.get();
      setUser(u);

      const res = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      const parsedPositions = res.positions
        ? JSON.parse(res.positions)
        : {};

      setGame(res);
      setPositions(parsedPositions);
      setTurn(res.turn);
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

        setTurn(payload.turn);

        setPositions(
          payload.positions
            ? JSON.parse(payload.positions)
            : {}
        );
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // PLAYER ROLE
  // =========================
  function myPlayerKey(gameData) {
    if (!user) return null;

    if (user.$id === gameData.hostId) return "hostId";
    if (user.$id === gameData.opponentId) return "opponentId";

    return null;
  }

  const isMyTurn = game?.turn === user?.$id;

  // =========================
  // MAIN TURN LOGIC (FIXED)
  // =========================
  async function playTurn() {
    if (!game || !user || rolling || lock.current) return;
    if (!isMyTurn) return;

    lock.current = true;
    setRolling(true);

    try {
      // 🔥 ALWAYS FRESH STATE
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      const pos = fresh.positions
        ? JSON.parse(fresh.positions)
        : {};

      const myKey = myPlayerKey(fresh);

      const opponentKey =
        myKey === "hostId" ? "opponentId" : "hostId";

      // 🎲 dice animation
      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(80);
      }

      const rolled = rollDice();
      setDice(rolled);

      const start = pos[myKey] || 1;
      let end = start + rolled;

      if (end > SIZE) end = SIZE;

      // 🐍 animate step
      let current = start;
      while (current < end) {
        await sleep(150);
        current++;
        setPositions((p) => ({ ...p, [myKey]: current }));
      }

      const finalPos = applyEffects(current);

      setPositions((p) => ({ ...p, [myKey]: finalPos }));

      const winner = finalPos >= SIZE ? user.$id : null;

      // 🔁 SAFE TURN SWITCH
      const nextTurn =
        fresh.turn === fresh.hostId
          ? fresh.opponentId
          : fresh.hostId;

      // 🧠 MERGE POSITIONS SAFELY
      const updatedPositions = {
        ...pos,
        [myKey]: finalPos
      };

      const history = [
        ...(fresh.history
          ? JSON.parse(fresh.history)
          : []),
        `🎲 ${user.$id} rolled ${rolled} → ${finalPos}`
      ].slice(-10);

      // 💾 SAVE TO APPWRITE
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify(updatedPositions),
          turn: winner ? null : nextTurn,
          status: winner ? "finished" : "running",
          winner: winner || "",
          history: JSON.stringify(history)
        }
      );

    } catch (err) {
      console.error("Dice error:", err);
    } finally {
      setRolling(false);
      lock.current = false;
    }
  }

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  const myKey = myPlayerKey(game);

  const myPos = positions[myKey] || 1;

  const oppKey =
    myKey === "hostId" ? "opponentId" : "hostId";

  const oppPos = positions[oppKey] || 1;

  return (
    <div style={{ textAlign: "center", background: "#0f172a", color: "#fff", minHeight: "100vh", padding: 20 }}>

      <h2>🐍 Snake Game</h2>

      <div>
        🎲 Dice: {dice}
      </div>

      <div>
        Turn: {game.turn === user?.$id ? "🟢 YOU" : "🔵 OPPONENT"}
      </div>

      <div style={{ position: "relative", width: 360, height: 360, margin: "20px auto" }}>
        <img src={boardImg} style={{ width: "100%" }} />

        <div style={{ position: "absolute", ...getCoords(myPos), background: "red", width: 25, height: 25, borderRadius: "50%" }} />

        <div style={{ position: "absolute", ...getCoords(oppPos), background: "blue", width: 25, height: 25, borderRadius: "50%" }} />
      </div>

      <button
        onClick={playTurn}
        disabled={!isMyTurn || rolling}
        style={{
          padding: 12,
          background: isMyTurn ? "gold" : "gray",
          border: "none",
          borderRadius: 8,
          cursor: "pointer"
        }}
      >
        {rolling ? "Rolling..." : "🎲 Roll Dice"}
      </button>

      <div style={{ marginTop: 10 }}>
        {game.history
          ? JSON.parse(game.history).map((h, i) => (
              <div key={i}>{h}</div>
            ))
          : null}
      </div>
    </div>
  );
}