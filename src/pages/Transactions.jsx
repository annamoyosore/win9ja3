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

const TRANSACTION_COLLECTION = "transactions";

// =========================
// COMPONENT
// =========================
export default function Transactions({ back }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const user = await account.get();

      // =========================
      // 1. LOAD TRANSACTIONS
      // =========================
      const txRes = await databases.listDocuments(
        DATABASE_ID,
        TRANSACTION_COLLECTION,
        [
          Query.equal("userId", user.$id),
          Query.orderDesc("createdAt")
        ]
      );

      const txList = txRes.documents.map((t) => ({
        id: "tx_" + t.$id,
        title: formatType(t.type),
        amount: Number(t.amount),
        status: t.status,
        createdAt: t.createdAt,
        color: getColor(t.type),
        sign: getSign(t.type)
      }));

      // =========================
      // 2. LOAD MATCHES (LIVE STATE)
      // =========================
      const matchRes = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION
      );

      const myMatches = matchRes.documents.filter(
        (m) =>
          m.hostId === user.$id ||
          m.opponentId === user.$id
      );

      const matchList = myMatches.map((m) => {
        let title = "";
        let amount = 0;
        let color = "#facc15";

        if (m.status === "waiting") {
          title = "Waiting for opponent";
          amount = -m.stake;
        }

        else if (m.status === "matched") {
          title = "Opponent joined";
          amount = -m.stake;
        }

        else if (m.status === "running") {
          title = "Game in progress";
          amount = -m.stake;
        }

        else {
          return null; // ❌ skip finished (already in transactions)
        }

        return {
          id: "match_" + m.$id,
          title,
          amount,
          status: m.status,
          createdAt: m.$createdAt,
          color,
          sign: ""
        };
      }).filter(Boolean);

      // =========================
      // 3. MERGE + SORT
      // =========================
      const merged = [...txList, ...matchList].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setData(merged);

    } catch (err) {
      console.log("tx error", err);
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
    if (type === "deposit" || type === "game_win") return "#22c55e";
    if (type === "withdrawal" || type === "game_loss") return "#ef4444";
    return "#facc15";
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
        <h2>📊 Activity</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📊 Activity</h1>

      {data.length === 0 && (
        <p style={styles.empty}>No activity yet</p>
      )}

      {data.map((t) => (
        <div key={t.id} style={styles.card}>
          {/* LEFT */}
          <div>
            <p style={styles.titleText}>{t.title}</p>
            <p style={styles.date}>
              {new Date(t.createdAt).toLocaleString()}
            </p>
          </div>

          {/* RIGHT */}
          <div style={styles.right}>
            <p
              style={{
                color: t.color,
                fontWeight: "bold"
              }}
            >
              {t.sign}₦{Number(t.amount).toLocaleString()}
            </p>

            <p style={styles.status}>{t.status}</p>
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
  titleText: {
    fontWeight: "bold"
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