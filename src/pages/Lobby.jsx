// =========================
// IMPORTS
// =========================
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

const GAME_COLLECTION = "games";

// =========================
// COMPONENT
// =========================
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

      await loadMatches();
      await loadActiveMatches(u.$id);
    } catch (err) {
      console.error("INIT ERROR:", err);
    }
  }

  // =========================
  // REALTIME FIX 🔥
  // =========================
  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => {
        loadMatches();
        loadActiveMatches(user.$id);
      }
    );

    return () => unsub();
  }, [user]);

  // =========================
  // LOAD WAITING MATCHES
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
  // LOAD ACTIVE MATCHES (FIXED)
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

      // 🔥 FILTER MANUALLY (handles "", null, etc)
      const myMatches = res.documents.filter(
        (m) =>
          m.hostId === userId ||
          m.opponentId === userId
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

      // refresh UI instantly
      await loadActiveMatches(user.$id);

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
      return alert("Minimum stake ₦50");
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
          opponentId: null, // ✅ FIXED
          stake: amount,
          pot: amount,
          status: "waiting",
          createdAt: new Date().toISOString()
        }
      );

      await loadActiveMatches(user.$id);

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

      {/* ACTIVE MATCHES */}
      {activeMatches.length > 0 && (
        <>
          <h2 style={styles.section}>🔥 Your Matches</h2>

          {activeMatches.map((m) => {
            const isWaiting =
              m.status === "waiting" && m.hostId === user?.$id;

            return (
              <div key={m.$id} style={styles.activeCard}>
                <p>💰 ₦{Number(m.stake).toLocaleString()}</p>
                <p>Status: {m.status}</p>

                <button
                  style={styles.resumeBtn}
                  onClick={() => goGame(m.$id, m.stake)}
                >
                  {isWaiting ? "⏳ Waiting..." : "▶ Resume Game"}
                </button>
              </div>
            );
          })}
        </>
      )}

      {/* AVAILABLE MATCHES */}
      <h2 style={styles.section}>🎯 Available Matches</h2>

      {matches.length === 0 && <p>No matches available</p>}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>💰 ₦{Number(m.stake).toLocaleString()}</p>

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
    background: "linear-gradient(135deg,#0f172a,#020617)",
    minHeight: "100vh",
    color: "#fff"
  },
  title: {
    fontSize: 28
  },
  section: {
    marginTop: 20,
    color: "gold"
  },
  loading: {
    color: "gold"
  },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between"
  },
  activeCard: {
    background: "#1e293b",
    padding: 15,
    marginBottom: 10,
    borderRadius: 10
  },
  joinBtn: {
    background: "gold",
    padding: 10,
    border: "none",
    borderRadius: 6
  },
  resumeBtn: {
    background: "#22c55e",
    padding: 10,
    border: "none",
    borderRadius: 6,
    marginTop: 5
  },
  createBox: {
    marginTop: 20
  },
  input: {
    width: "100%",
    padding: 10,
    marginBottom: 10
  },
  createBtn: {
    width: "100%",
    padding: 12,
    background: "#3b82f6",
    border: "none",
    borderRadius: 6,
    color: "#fff"
  },
  back: {
    marginTop: 20,
    padding: 10,
    background: "gray",
    border: "none",
    borderRadius: 6
  }
};