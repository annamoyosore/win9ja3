import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

import { lockFunds, unlockFunds } from "../lib/wallet";

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      const w = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );

      if (w.documents.length) setWallet(w.documents[0]);

      await refreshAll(u.$id);
    } catch (err) {
      console.error("INIT ERROR:", err);
    }
  }

  // =========================
  // REALTIME 🔥
  // =========================
  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => {
        refreshAll(user.$id);
      }
    );

    return () => unsub();
  }, [user]);

  async function refreshAll(userId) {
    await Promise.all([
      loadMatches(),
      loadActiveMatches(userId)
    ]);
  }

  // =========================
  // AVAILABLE MATCHES
  // =========================
  async function loadMatches() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [
          Query.equal("status", "waiting"),
          Query.orderDesc("$createdAt")
        ]
      );

      setMatches(res.documents);
    } catch (err) {
      console.error("LOAD MATCHES ERROR:", err);
    }
  }

  // =========================
  // ACTIVE MATCHES (FIXED 🔥)
  // =========================
  async function loadActiveMatches(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [
          Query.notEqual("status", "finished")
        ]
      );

      const myMatches = res.documents
        .filter(
          (m) =>
            m.hostId === userId ||
            m.opponentId === userId
        )
        // 🔥 IMPORTANT: latest first
        .sort(
          (a, b) =>
            new Date(b.$updatedAt) - new Date(a.$updatedAt)
        );

      setActiveMatches(myMatches);
    } catch (err) {
      console.error("ACTIVE MATCH ERROR:", err);
    }
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loading) return;

    try {
      setLoading(true);

      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        alert("Match already taken");
        setLoading(false);
        return;
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        alert("Insufficient balance");
        setLoading(false);
        return;
      }

      await lockFunds(user.$id, fresh.stake);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: fresh.stake * 2
        }
      );

      goGame(fresh.$id, fresh.stake);

    } catch (err) {
      alert(err.message);

      try {
        await unlockFunds(user.$id, match.stake);
      } catch {}

      setLoading(false);
    }
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    if (loading) return;

    const amount = Number(stake);

    if (!amount || amount < 50) {
      return alert("Minimum ₦50");
    }

    if ((wallet?.balance || 0) < amount) {
      return alert("Insufficient balance");
    }

    try {
      setLoading(true);

      await lockFunds(user.$id, amount);

      const match = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          createdAt: new Date().toISOString()
        }
      );

      goGame(match.$id, amount);

    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎮 Game Lobby</h1>

      {loading && <p style={styles.loading}>⚡ Processing...</p>}

      {/* 🔥 ACTIVE MATCHES */}
      {activeMatches.length > 0 && (
        <>
          <h2 style={styles.section}>🔥 Your Matches</h2>

          {activeMatches.map((m) => {
            const isHost = m.hostId === user?.$id;
            const waiting = m.status === "waiting";

            return (
              <div key={m.$id} style={styles.activeCard}>
                <div>
                  <p>💰 ₦{Number(m.stake).toLocaleString()}</p>
                  <p>Status: {m.status}</p>
                </div>

                <button
                  style={styles.resumeBtn}
                  onClick={() => goGame(m.$id, m.stake)}
                >
                  {waiting && isHost
                    ? "⏳ Waiting..."
                    : "▶ Resume"}
                </button>
              </div>
            );
          })}
        </>
      )}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available Matches</h2>

      {matches.length === 0 && (
        <p style={{ opacity: 0.6 }}>No matches available</p>
      )}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>₦{Number(m.stake).toLocaleString()}</span>

          <button
            style={styles.joinBtn}
            onClick={() => joinMatch(m)}
            disabled={loading}
          >
            Join
          </button>
        </div>
      ))}

      {/* CREATE */}
      <div style={styles.createBox}>
        <input
          type="number"
          placeholder="Enter stake ₦"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          style={styles.input}
        />

        <button
          style={styles.createBtn}
          onClick={createMatch}
          disabled={loading}
        >
          Create Match
        </button>
      </div>

      {/* BACK */}
      <button style={styles.back} onClick={back}>
        ← Back
      </button>
    </div>
  );
}

// =========================
// STYLES (UPGRADED UI 🎨)
// =========================
const styles = {
  container: {
    padding: 20,
    minHeight: "100vh",
    background: "linear-gradient(135deg,#020617,#0f172a)",
    color: "#fff"
  },

  title: {
    fontSize: 28,
    fontWeight: "bold"
  },

  section: {
    marginTop: 25,
    color: "#facc15"
  },

  loading: {
    color: "#facc15"
  },

  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  activeCard: {
    background: "#1e293b",
    padding: 15,
    marginBottom: 10,
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1px solid #334155"
  },

  joinBtn: {
    background: "#facc15",
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer"
  },

  resumeBtn: {
    background: "#22c55e",
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    color: "#fff",
    cursor: "pointer"
  },

  createBox: {
    marginTop: 25
  },

  input: {
    width: "100%",
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
    border: "none"
  },

  createBtn: {
    width: "100%",
    padding: 12,
    background: "#3b82f6",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer"
  },

  back: {
    marginTop: 25,
    padding: 10,
    background: "#475569",
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  }
};