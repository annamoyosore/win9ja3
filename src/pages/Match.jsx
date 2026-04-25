import { useEffect, useState } from "react";
import { databases, DATABASE_ID, MATCH_COLLECTION } from "../lib/appwrite";

// =========================
// MATCH WAITING PAGE
// =========================
export default function Match({ matchId, startGame }) {
  const [status, setStatus] = useState("waiting");

  useEffect(() => {
    if (!matchId) return;

    // ⏱️ Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        const match = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          matchId
        );

        setStatus(match.status);

        // 🎮 When opponent joins → start game
        if (match.status === "matched") {
          clearInterval(interval);

          // small delay for UX
          setTimeout(() => {
            startGame(matchId);
          }, 1000);
        }
      } catch (err) {
        console.error("Match error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [matchId]);

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🔎 Searching for opponent...</h2>

      <p>Status: {status}</p>

      <div style={styles.loader}></div>

      <p style={{ marginTop: 20 }}>
        Please wait while we find a player with the same stake...
      </p>
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
    color: "#fff"
  },

  loader: {
    marginTop: 20,
    width: 50,
    height: 50,
    border: "5px solid #444",
    borderTop: "5px solid gold",
    borderRadius: "50%",
    animation: "spin 1s linear infinite"
  }
};