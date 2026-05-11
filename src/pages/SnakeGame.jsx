import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query
} from "./lib/appwrite"; // ✅ FIXED SAFE PATH (adjust if needed)

import boardImg from "./board.png";

// =========================
// CONSTANTS
// =========================
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
// COMPONENT
// =========================
export default function SnakeGame({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [showWin, setShowWin] = useState(false);

  const payoutLock = useRef(false);

  // =========================
  // LOAD USER + GAME
  // =========================
  useEffect(() => {
    async function init() {
      try {
        const u = await account.get();
        setUser(u);

        const g = await databases.getDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId
        );

        setGame(g);
      } catch (err) {
        console.error("INIT ERROR:", err);
      }
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME SAFE SUBSCRIBE
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client?.subscribe?.(
      `databases.${DATABASE_ID}.collections.${SNAKE_GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        if (res?.payload) setGame(res.payload);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [gameId]);

  // =========================
  // TURN CHECK
  // =========================
  const isMyTurn = () => {
    return game?.turn === user?.$id;
  };

  // =========================
  // SAFE POSITION PARSE
  // =========================
  function getPositions() {
    try {
      return typeof game?.positions === "string"
        ? JSON.parse(game.positions)
        : game?.positions || {};
    } catch {
      return {};
    }
  }

  // =========================
  // PAYOUT
  // =========================
  async function payoutWinner(winnerId) {
    if (payoutLock.current) return;
    payoutLock.current = true;

    try {
      const pot = Number(game?.pot || 0);
      if (pot <= 0) return;

      const wallet = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", winnerId), Query.limit(1)]
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

      // 🧾 clear game + finish lobby
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          pot: 0,
          status: "finished"
        }
      );

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

      setShowWin(true);

      setTimeout(() => setShowWin(false), 3000);

    } catch (err) {
      console.error("PAYOUT ERROR:", err);
    }
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || !user || rolling) return;
    if (!isMyTurn()) return;

    setRolling(true);

    try {
      const d = rollDice();
      setDice(d);

      const pos = getPositions();

      const start = pos[user.$id] || 1;
      let end = start + d;

      if (end > SIZE) end = SIZE;

      let final = end;

      if (snakes[final]) final = snakes[final];
      if (ladders[final]) final = ladders[final];

      const updated = {
        ...pos,
        [user.$id]: final
      };

      const opp = game.players.find(p => p !== user.$id);

      const isWin = final >= SIZE;

      const updateData = {
        positions: JSON.stringify(updated),
        turn: opp
      };

      if (isWin) {
        updateData.status = "finished";
        updateData.winnerId = user.$id;
      }

      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        updateData
      );

      if (isWin) {
        await payoutWinner(user.$id);
      }

    } catch (err) {
      console.error("PLAY ERROR:", err);
    } finally {
      setRolling(false);
    }
  }

  // =========================
  // SAFE RENDER GUARD
  // =========================
  if (!game || !user) {
    return <div style={{ color: "#fff" }}>Loading...</div>;
  }

  const pos = getPositions();

  const myPos = pos[user.$id] || 1;
  const oppId = game.players.find(p => p !== user.$id);
  const oppPos = pos[oppId] || 1;

  return (
    <div style={{ textAlign: "center", background: "#0f172a", color: "#fff", minHeight: "100vh" }}>

      <h2>🐍 Snake Game</h2>

      {/* 💰 POT */}
      <div style={{ fontWeight: "bold" }}>
        💰 Pot: ₦{game?.pot || 0}
      </div>

      {/* TURN */}
      <div>
        {isMyTurn() ? "🟢 Your Turn" : "⏳ Opponent Turn"}
      </div>

      {/* BOARD */}
      <div style={{ position: "relative", width: 360, height: 360, margin: "auto" }}>
        <img src={boardImg} style={{ width: "100%", height: "100%" }} />

        <div style={{ position: "absolute", ...getCoords(myPos), width: 25, height: 25, background: "red", borderRadius: "50%" }} />
        <div style={{ position: "absolute", ...getCoords(oppPos), width: 25, height: 25, background: "blue", borderRadius: "50%" }} />
      </div>

      {/* DICE */}
      <div>🎲 Dice: {dice}</div>

      <button
        onClick={playTurn}
        disabled={!isMyTurn() || rolling}
        style={{ padding: 10, marginTop: 10 }}
      >
        Roll Dice
      </button>

      {/* 🏆 WIN POPUP */}
      {showWin && (
        <div style={{
          position: "fixed",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "gold",
          color: "#000",
          padding: 20,
          borderRadius: 12,
          fontSize: 20,
          fontWeight: "bold",
          zIndex: 9999
        }}>
          🏆 YOU WON ₦{game?.pot || 0}
        </div>
      )}

    </div>
  );
}