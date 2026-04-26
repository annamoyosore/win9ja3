import { useEffect, useState } from "react";
import { databases, account, DATABASE_ID } from "./lib/appwrite";
import { payWinner } from "./lib/wallet";

const GAME_COLLECTION = "games";
const TURN_LIMIT = 24 * 60 * 60 * 1000;

// =========================
// SAFE PARSER
// =========================
function parseGame(g) {
  try {
    return {
      ...g,
      deck: JSON.parse(g.deck || "[]"),
      discard: JSON.parse(g.discard || "[]"),
      hands: JSON.parse(g.hands || "[[],[]]"),
      scores: JSON.parse(g.scores || '{"p1":0,"p2":0}')
    };
  } catch {
    return g;
  }
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, stake = 0 }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then((u) => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME (WITH RETRY 🔥)
  // =========================
  useEffect(() => {
    if (!gameId) return;

    let retry = true;

    async function load() {
      while (retry) {
        try {
          const g = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            gameId
          );

          setGame(parseGame(g));
          retry = false;

        } catch {
          // 🔁 wait until game is created
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    load();

    return () => {
      retry = false;
    };
  }, [gameId]);

  // =========================
  // REALTIME (LIGHTWEIGHT)
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        setGame(parseGame(res.payload));
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // TIMEOUT CHECK
  // =========================
  useEffect(() => {
    if (!game || !userId) return;

    const interval = setInterval(async () => {
      if (game.status === "finished") return;

      const expired =
        Date.now() - new Date(game.turnStartTime).getTime() > TURN_LIMIT;

      if (expired && game.turn === userId) {
        await handleTimeout(game);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [game, userId]);

  // =========================
  // TIMEOUT HANDLER
  // =========================
  async function handleTimeout(g) {
    const p1 = g.hands[0].length;
    const p2 = g.hands[1].length;

    let winnerId = null;

    if (p1 < p2) winnerId = g.players[0];
    else if (p2 < p1) winnerId = g.players[1];

    if (winnerId && g.status !== "finished") {
      if (winnerId === userId) {
        await payWinner(userId, stake * 2);
      }

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        g.$id,
        {
          status: "finished",
          winnerId
        }
      );
    }
  }

  // =========================
  // UI
  // =========================
  if (!game) {
    return (
      <div style={{ padding: 20, color: "white" }}>
        <h2>🎮 Loading Game...</h2>
        <p>Connecting players...</p>
      </div>
    );
  }

  const playerIndex = game.players.indexOf(userId);
  const hand = game.hands[playerIndex] || [];

  return (
    <div style={{ padding: 20 }}>
      <h2>🎮 Multiplayer WHOT</h2>

      <p>Round: {game.round}</p>
      <p>Score: {game.scores.p1} - {game.scores.p2}</p>

      <p>
        Turn: {game.turn === userId ? "YOUR TURN" : "Opponent"}
      </p>

      <h3>Top Card</h3>
      <pre>{JSON.stringify(game.discard.at(-1))}</pre>

      <h3>Your Cards</h3>
      {hand.map((c, i) => (
        <button key={i}>
          {c.shape} {c.number}
        </button>
      ))}

      <br /><br />

      {game.status === "finished" && (
        <h1>
          {game.winnerId === userId ? "🏆 YOU WIN" : "❌ YOU LOSE"}
        </h1>
      )}
    </div>
  );
}