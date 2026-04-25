import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  MATCH_COLLECTION
} from "../lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// CREATE GAME FUNCTION
// =========================
function createDeck() {
  const shapes = ["circle", "triangle", "square", "star", "cross"];
  const deck = [];

  for (const shape of shapes) {
    for (let i = 1; i <= 13; i++) {
      if (i === 6 || i === 9) continue;
      deck.push({ shape, number: i });
    }
    deck.push({ shape, number: 14 });
  }

  return deck.sort(() => Math.random() - 0.5);
}

async function createGame(match) {
  const deck = createDeck();

  return databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    match.$id, // 🔥 SAME ID AS MATCH
    {
      players: [match.hostId, match.opponentId],

      hands: JSON.stringify([
        deck.splice(0, 6),
        deck.splice(0, 6)
      ]),

      deck: JSON.stringify(deck),
      discard: JSON.stringify([deck.pop()]),

      scores: JSON.stringify({ p1: 0, p2: 0 }),
      round: 1,

      turn: match.hostId,
      status: "running",
      winnerId: "",
      turnStartTime: new Date().toISOString()
    }
  );
}

// =========================
// MATCH PAGE
// =========================
export default function Match({ matchId, stake, startGame, cancel }) {
  const [status, setStatus] = useState("waiting");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!matchId) return;

    const interval = setInterval(async () => {
      try {
        const match = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          matchId
        );

        setStatus(match.status);

        // =========================
        // 🔥 MATCH FOUND → CREATE GAME
        // =========================
        if (match.status === "matched" && !creating) {
          setCreating(true);

          try {
            // 🔥 TRY CREATE GAME (only first user succeeds)
            await createGame(match);

            console.log("Game created");

          } catch (err) {
            // ⚠️ This will fail for second player (already created)
            console.warn("Game already exists or creation failed:", err.message);
          }

          clearInterval(interval);

          // small delay for DB sync
          setTimeout(() => {
            startGame();
          }, 800);
        }

      } catch (err) {
        console.error("Match error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [matchId, creating]);

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🔎 Searching for opponent...</h2>

      <h3>💰 Stake: ₦{Number(stake).toLocaleString()}</h3>

      <p>Status: {status}</p>

      <div style={styles.loader}></div>

      <p style={{ marginTop: 20 }}>
        Please wait while we find a player...
      </p>

      <button style={styles.cancelBtn} onClick={cancel}>
        ❌ Cancel
      </button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a",
    color: "#fff",
    textAlign: "center"
  },

  loader: {
    marginTop: 20,
    width: 50,
    height: 50,
    border: "5px solid #444",
    borderTop: "5px solid gold",
    borderRadius: "50%",
    animation: "spin 1s linear infinite"
  },

  cancelBtn: {
    marginTop: 25,
    padding: 12,
    background: "red",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer"
  }
};