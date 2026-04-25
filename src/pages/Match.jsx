import { useEffect, useState } from "react";
import { databases, DATABASE_ID, MATCH_COLLECTION } from "../lib/appwrite";

// =========================
// MATCH WAITING PAGE
// =========================
export default function Match({ matchId, stake, startGame, cancel }) {
  const [status, setStatus] = useState("waiting");

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

        // 🎮 When opponent joins → start game
        if (match.status === "matched") {
          clearInterval(interval);

          setTimeout(() => {
            startGame();
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

      {/* ✅ NAIRA FORMAT */}
      <h3>💰 Stake: ₦{Number(stake).toLocaleString()}</h3>

      <p>Status: {status}</p>

      <div style={styles.loader}></div>

      <p style={{ marginTop: 20 }}>
        Please wait while we find a player with the same stake...
      </p>

      {/* ✅ CANCEL BUTTON */}
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