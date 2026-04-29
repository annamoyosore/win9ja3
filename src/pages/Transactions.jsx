// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query
} from "../lib/appwrite";

const TRANSACTION_COLLECTION = "transactions";

// =========================
// COMPONENT
// =========================
export default function Transactions({ back }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const user = await account.get();

      // 🔒 Fetch ONLY current user transactions
      const res = await databases.listDocuments(
        DATABASE_ID,
        TRANSACTION_COLLECTION,
        [
          Query.equal("userId", user.$id),
          Query.orderDesc("createdAt"),
          Query.limit(100)
        ]
      );

      setTransactions(res.documents);

    } catch (err) {
      console.error("Transaction load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // HELPERS
  // =========================
  function formatType(type) {
    switch (type) {
      case "deposit":
        return "Deposit";
      case "withdrawal":
        return "Withdrawal";
      case "game_win":
        return "Game Win";
      case "game_loss":
        return "Game Loss";
      default:
        return "Transaction";
    }
  }

  function getColor(type) {
    if (type === "deposit" || type === "game_win") return "#22c55e"; // green
    if (type === "withdrawal" || type === "game_loss") return "#ef4444"; // red
    return "#facc15"; // yellow
  }

  function getSign(type) {
    if (type === "deposit" || type === "game_win") return "+";
    if (type === "withdrawal" || type === "game_loss") return "-";
    return "";
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
        <div key={t.$id} style={styles.card}>
          {/* LEFT */}
          <div>
            <p style={styles.type}>{formatType(t.type)}</p>
            <p style={styles.date}>
              {new Date(t.createdAt).toLocaleString()}
            </p>
          </div>

          {/* RIGHT */}
          <div style={styles.right}>
            <p
              style={{
                color: getColor(t.type),
                fontWeight: "bold",
                fontSize: 16
              }}
            >
              {getSign(t.type)}₦{Number(t.amount).toLocaleString()}
            </p>

            <p style={styles.status}>
              {t.status || "completed"}
            </p>
          </div>
        </div>
      ))}

      {/* BACK */}
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
    fontSize: 26,
    marginBottom: 15,
    color: "gold"
  },
  empty: {
    opacity: 0.6,
    textAlign: "center",
    marginTop: 20
  },
  card: {
    background: "#111827",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  type: {
    fontWeight: "bold",
    fontSize: 15
  },
  date: {
    fontSize: 12,
    opacity: 0.6
  },
  right: {
    textAlign: "right"
  },
  status: {
    fontSize: 12,
    opacity: 0.7
  },
  back: {
    marginTop: 20,
    padding: 12,
    background: "#475569",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    width: "100%"
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