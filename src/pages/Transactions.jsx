// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  Query
} from "../lib/appwrite";

const GAME_COLLECTION = "games"; // change to "dice_games" if needed

// =========================
// COMPONENT
// =========================
export default function Transactions({ back }) {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION
      );

      const myMatches = res.documents.filter(
        (m) =>
          m.hostId === u.$id || m.opponentId === u.$id
      );

      const enriched = await Promise.all(
        myMatches.map(async (m) => {
          let winnerId = null;

          if (m.gameId) {
            try {
              const g = await databases.getDocument(
                DATABASE_ID,
                GAME_COLLECTION,
                m.gameId
              );
              winnerId = g.winnerId;
            } catch {}
          }

          const isWinner = winnerId === u.$id;
          const isFinished = m.status === "finished";

          let result = "Pending";
          let amount = 0;

          if (isFinished) {
            if (isWinner) {
              result = "Won";
              amount = m.pot;
            } else {
              result = "Lost";
              amount = -m.stake;
            }
          }

          return {
            id: m.$id,
            stake: m.stake,
            pot: m.pot,
            result,
            amount,
            status: m.status,
            createdAt: m.$createdAt
          };
        })
      );

      // sort newest first
      enriched.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setTransactions(enriched);

    } catch (err) {
      console.log("tx error", err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // LOADING
  // =========================
  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>📊 Transactions</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📊 Transactions</h1>

      {transactions.length === 0 && (
        <p style={styles.empty}>No transactions yet</p>
      )}

      {transactions.map((t) => (
        <div key={t.id} style={styles.card}>
          <div>
            <p style={styles.amount}>₦{t.stake}</p>
            <p style={styles.date}>
              {new Date(t.createdAt).toLocaleString()}
            </p>
          </div>

          <div style={styles.right}>
            <p
              style={{
                color:
                  t.result === "Won"
                    ? "#22c55e"
                    : t.result === "Lost"
                    ? "#ef4444"
                    : "#facc15"
              }}
            >
              {t.result}
            </p>

            <p style={styles.value}>
              {t.amount > 0 ? "+" : ""}
              ₦{t.amount}
            </p>
          </div>
        </div>
      ))}

      <button style={styles.back} onClick={back}>
        ← Back
      </button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    minHeight: "100vh",
    background: "#020617",
    color: "#fff"
  },
  title: {
    fontSize: 24,
    marginBottom: 15
  },
  empty: {
    opacity: 0.6
  },
  card: {
    background: "#111827",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  amount: {
    fontWeight: "bold"
  },
  date: {
    fontSize: 12,
    opacity: 0.6
  },
  right: {
    textAlign: "right"
  },
  value: {
    fontWeight: "bold"
  },
  back: {
    marginTop: 20,
    padding: 10,
    background: "#475569",
    border: "none",
    borderRadius: 8,
    color: "#fff"
  },
  loading: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "#020617",
    color: "#fff"
  }
};