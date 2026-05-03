import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  CASINO_COLLECTION,
  Query
} from "../lib/appwrite";

const GAME_COLLECTION = "games";
const DEPOSIT_COLLECTION = "deposit_requests";
const WITHDRAW_COLLECTION = "withdrawal_requests";

export default function Transactions({ back }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

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

  async function init() {
    try {
      setLoading(true);

      const user = await account.get();

      // =========================
      // MATCHES (UNCHANGED)
      // =========================
      const hostMatches = await fetchAll(MATCH_COLLECTION, [
        Query.equal("hostId", user.$id)
      ]);

      const opponentMatches = await fetchAll(MATCH_COLLECTION, [
        Query.equal("opponentId", user.$id)
      ]);

      const matchMap = new Map();
      [...hostMatches, ...opponentMatches].forEach(m => {
        matchMap.set(m.$id, m);
      });

      const matches = Array.from(matchMap.values());

      const matchList = await Promise.all(
        matches.map(async (m) => {
          let title = "";
          let amount = 0;
          let color = "#facc15";

          let winnerId = m.winnerId || null;

          if (!winnerId && m.gameId) {
            try {
              const g = await databases.getDocument(
                DATABASE_ID,
                GAME_COLLECTION,
                m.gameId
              );
              winnerId = g.winnerId;
            } catch {}
          }

          switch (m.status) {
            case "waiting":
            case "matched":
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
      // CASINO (FIXED)
      // =========================
      const casino = await fetchAll(CASINO_COLLECTION, [
        Query.equal("userId", user.$id)
      ]);

      const casinoList = casino.map(c => {
        const outcome = c.result; // ✅ correct field
        const win = Number(c.win || 0);
        const stake = Number(c.stake || 0);

        let net = win - stake;
        let color = "#facc15";
        let title = "Casino Spin";

        if (win > stake) {
          color = "#22c55e";
          title = `Won (${outcome})`;
        } else if (outcome === "FREE") {
          color = "purple";
          title = "Free Spin";
          net = 0;
        } else if (outcome === "ALMOST") {
          color = "orange";
          title = "Almost! Try again";
          net = -stake;
        } else {
          color = "#ef4444";
          title = `Lost (${outcome})`;
          net = -stake;
        }

        return {
          id: "casino_" + c.$id,
          title,
          amount: net,
          color,
          status: outcome,
          createdAt: c.$createdAt // ✅ correct timestamp
        };
      });

      // =========================
      // DEPOSITS (UNCHANGED)
      // =========================
      const deposits = await fetchAll(DEPOSIT_COLLECTION, [
        Query.equal("userId", user.$id)
      ]);

      const depositList = deposits.map(d => {
        let color = "#facc15";

        if (d.status === "approved") color = "#22c55e";
        if (d.status === "rejected") color = "#ef4444";

        return {
          id: "dep_" + d.$id,
          title:
            d.status === "approved"
              ? "Deposit Successful"
              : d.status === "rejected"
              ? "Deposit Failed"
              : "Deposit Pending",
          amount: Number(d.amount || 0),
          color,
          status: d.status || "pending",
          createdAt: d.$createdAt
        };
      });

      // =========================
      // WITHDRAWALS (UNCHANGED)
      // =========================
      const withdrawals = await fetchAll(WITHDRAW_COLLECTION, [
        Query.equal("userId", user.$id)
      ]);

      const withdrawalList = withdrawals.map(w => {
        let color = "#facc15";

        if (w.status === "approved") color = "#ef4444";
        if (w.status === "rejected") color = "#22c55e";

        return {
          id: "wd_" + w.$id,
          title:
            w.status === "approved"
              ? "Withdrawal Sent"
              : w.status === "rejected"
              ? "Withdrawal Reversed"
              : "Withdrawal Pending",
          amount: -Number(w.amount || 0),
          color,
          status: w.status || "pending",
          createdAt: w.$createdAt
        };
      });

      // =========================
      // MERGE ALL
      // =========================
      const merged = [
        ...matchList,
        ...casinoList,
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

  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>📊 Activity</h2>
        <p>Loading...</p>
      </div>
    );
  }

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