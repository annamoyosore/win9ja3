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

// 🐍 snakes
const snakes = {
  50: 5,
  43: 17,
  56: 8,
  68: 15,
  84: 58,
  87: 49,
  98: 40,
};

// 🪜 ladders
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// =========================
// SAFE PAYOUT (NEW)
// =========================
async function payoutWinner(game, winnerId) {
  try {
    const pot = Number(game?.pot || 0);

    if (!pot || pot <= 0) return;

    const wallet = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", winnerId),
        Query.limit(1)
      ]
    );

    if (!wallet.documents.length) return;

    const w = wallet.documents[0];

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      w.$id,
      {
        balance: Number(w.balance || 0) + pot
      }
    );

    // 🧾 clear pot + finish game
    await databases.updateDocument(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION,
      game.$id,
      {
        pot: 0,
        status: "finished"
      }
    );

    // 🏁 finish lobby
    if (game?.lobbyId) {
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        game.lobbyId,
        {
          status: "finished"
        }
      );
    }

  } catch (err) {
    console.error("PAYOUT ERROR:", err);
  }
}

// =========================
// MAIN
// =========================
export default function SnakeGame({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  useEffect(() => {
    async function init() {
      const u = await account.get();
      setUser(u);

      const g = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      setGame(g);
    }

    init();
  }, [gameId]);

  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${SNAKE_GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        setGame(res.payload);
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  function isMyTurn() {
    return game?.turn === user?.$id;
  }

  function getOpponentId() {
    if (!game || !user) return null;

    return game.hostId === user.$id
      ? game.opponentId
      : game.hostId;
  }

  // =========================
  async function animateMove(start, end) {
    let current = start;

    while (current < end) {
      await sleep(180);
      current++;
    }

    let final = current;

    if (snakes[final]) final = snakes[final];
    if (ladders[final]) final = ladders[final];

    return final;
  }

  // =========================
  async function playTurn() {
    if (!game || !user || rolling) return;
    if (!isMyTurn()) return alert("Not your turn");

    if (lock.current) return;
    lock.current = true;

    setRolling(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      const d = rollDice();
      setDice(d);

      const pos = JSON.parse(fresh.positions || "{}");

      const start = pos[user.$id] || 1;
      let end = start + d;

      if (end > SIZE) end = SIZE;

      const finalPos = await animateMove(start, end);

      const opponentId = getOpponentId();

      const updatedPositions = {
        ...pos,
        [user.$id]: finalPos
      };

      const nextTurn = opponentId || user.$id;

      const history = [
        ...(JSON.parse(fresh.history || "[]")),
        `${user.name || "Player"} rolled ${d} → ${finalPos}`
      ].slice(-10);

      const updated = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify(updatedPositions),
          turn: nextTurn,
          history: JSON.stringify(history),
        }
      );

      setGame(updated);

      // =========================
      // 🏆 WIN CONDITION + PAYOUT
      // =========================
      if (finalPos >= SIZE) {
        await payoutWinner(updated, user.$id);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      lock.current = false;
    }
  }

  // =========================
  if (!game || !user) return <div>Loading...</div>;

  const positions = JSON.parse(game.positions || "{}");

  const myPos = positions[user.$id] || 1;

  const oppId = getOpponentId();
  const oppPos = positions[oppId] || 1;

  const myCoords = getCoords(myPos);
  const oppCoords = getCoords(oppPos);

  const myTurn = isMyTurn();

  // =========================
  return (
    <div style={{ textAlign: "center", background: "#0f172a", color: "#fff", minHeight: "100vh" }}>
      <h2>🐍 Snake Game</h2>

      {/* 💰 POT DISPLAY (NEW) */}
      <div style={{ marginBottom: 10, fontWeight: "bold", color: "gold" }}>
        💰 Pot: ₦{game?.pot || 0}
      </div>

      <div>
        {myTurn ? "🟢 Your Turn" : "⏳ Opponent Turn"}
      </div>

      <div style={{ position: "relative", width: 360, height: 360, margin: "auto" }}>
        <img src={boardImg} style={{ width: "100%", height: "100%" }} />

        <div style={{ position: "absolute", ...myCoords, width: 25, height: 25, background: "red", borderRadius: "50%" }} />
        <div style={{ position: "absolute", ...oppCoords, width: 25, height: 25, background: "blue", borderRadius: "50%" }} />
      </div>

      <div>🎲 Dice: {dice}</div>

      <button
        onClick={playTurn}
        disabled={!myTurn || rolling}
        style={{
          marginTop: 10,
          padding: 10,
          background: myTurn ? "gold" : "gray",
          borderRadius: 8
        }}
      >
        {rolling ? "Rolling..." : "Roll Dice"}
      </button>
    </div>
  );
}