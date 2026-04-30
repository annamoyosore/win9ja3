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

const GAME_COLLECTION = "games";
const DEPOSIT_COLLECTION = "deposit_requests";
const WITHDRAW_COLLECTION = "withdrawal_requests";

// =========================
// COMPONENT
// =========================
export default function Transactions({ back }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  // =========================
  // PAGINATION HELPER
  // =========================
  async function fetchAll(collection, queries = []) {
    let all = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await databases.listDocuments(
        DATABASE_ID,
        collection,
        [...queries, Query.limit(limit), Query.offset(offset)]
      );

      all = [...all, ...res.documents];

      if (res.documents.length < limit) break;
      offset += limit;
    }

    return all;
  }

  // =========================
  // INIT LOAD
  // =========================
  async function init() {
    try {
      setLoading(true);

      const user = await account.get();

      // =========================
      // LOAD MATCHES (FILTER SERVER SIDE)
      // =========================
      const matches = await fetchAll(MATCH_COLLECTION, [
        Query.or([
          Query.equal("hostId", user.$id),
          Query.equal("opponentId", user.$id)
        ])
      ]);

      const matchList = await Promise.all(
        matches.map(async (m) => {
          let title = "";
          let amount = 0;
          let color = "#facc15";

          let winnerId = m.winnerId || null;

          // fallback if not stored in match
          if (!winnerId && m.gameId) {
            try {
              const g = await databases.getDocument(
                DATABASE_ID,
                GAME_COLLECTION,
                m.gameId
              );
              winnerId = g.winnerId;
            } catch (err) {
              console.log("game fetch failed", err);
            }
          }

          // =========================
          // STATUS LOGIC (FIXED)
          // =========================
          switch (m.status) {
            case "waiting":
              title = "Waiting for opponent";
              amount = -Number(m.stake || 0);
              break;

            case "matched":
              title = "Opponent joined";
              amount = -Number(m.stake || 0);
              break;

            case "running":
              title = "Game in progress";
              amount = -Number(m.stake || 0);
              break;

            case "finished":
              if (winnerId === user.$id) {
                title = "Game Won";
                amount = Number(m.pot || 0);
                color = "#22c55e";
              } else {
                title = "Game Lost";
                amount = -Number(m.stake || 0);
                color = "#ef4444";
              }
              break;

            default:
              title = "Match Update";
              amount = 0;
          }

          return {
            id: "match_" + m.$id,
            title,
            amount,
            color,
            status: m.status || "unknown",
            createdAt: m.$createdAt
          };
        })
      );

      // =========================
      // LOAD DEPOSITS
      // =========================
      const deposits = await fetchAll(DEPOSIT_COLLECTION, [
        Query.equal("userId", user.$id)
      ]);

      const depositList = deposits.map(d => ({
        id: "dep_" + d.$id,
        title: "Deposit",
        amount: Number(d.amount || 0),
        color: d.status === "approved" ? "#22c55e" : "#facc15",
        status: d.status || "pending",
        createdAt: d.$createdAt
      }));

      // =========================
      // LOAD WITHDRAWALS
      // =========================
      const withdrawals = await fetchAll(WITHDRAW_COLLECTION, [
        Query.equal("userId", user.$id)
      ]);

      const withdrawalList = withdrawals.map(w => ({
        id: "wd_" + w.$id,
        title: "Withdrawal",
        amount: -Number(w.amount || 0),
        color: w.status === "approved" ? "#ef4444" : "#facc15",
        status: w.status || "pending",
        createdAt: w.$createdAt
      }));

      // =========================
      // MERGE + SORT
      // =========================
      const merged = [
        ...matchList,
        ...depositList,
        ...withdrawalList
      ].sort(
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
  // LOADING UI
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
  // MAIN UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📊 Activity</h1>

      {data.length === 0 && (
        <p style={styles.empty}>No activity yet</p>
      )}

      {data.map((t) => (
        <div key={t.id} style={styles.card}>
          <div>
            <p style={styles.titleText}>{t.title}</p>
            <p style={styles.date}>
              {new Date(t.createdAt).toLocaleString()}
            </p>
          </div>

          <div style={styles.right}>
            <p style={{ color: t.color, fontWeight: "bold" }}>
              {t.amount > 0 ? "+" : ""}
              ₦{Number(t.amount).toLocaleString()}
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
    textAlign: "center"
  },
  card: {
    background: "#111827",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    display: "flex",
    justifyContent: "space-between"
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
    justifyContent: "center",
    alignItems: "center",
    background: "#020617",
    color: "#fff"
  }
};