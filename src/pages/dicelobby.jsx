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

// =========================
// COMPONENT
// =========================
export default function DiceLobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);

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

      refresh(u.$id);
    } catch (e) {
      console.log("init error", e);
    }
  }

  // =========================
  // REFRESH
  // =========================
  async function refresh(userId) {
    await loadMatches(userId);
    await loadActiveMatches(userId);
  }

  // =========================
  // LOAD AVAILABLE MATCHES
  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.equal("status", "waiting")]
    );

    const filtered = res.documents.filter(
      (m) => m.hostId !== userId
    );

    setMatches(filtered);
  }

  // =========================
  // LOAD ACTIVE MATCHES
  // =========================
  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION
    );

    const mine = res.documents.filter(
      (m) =>
        (m.hostId === userId || m.opponentId === userId)
    );

    setActiveMatches(mine);
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loading) return;
    setLoading(true);

    try {
      if (match.hostId === user.$id) {
        alert("You cannot join your own match");
        return;
      }

      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        alert("Already taken");
        return;
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        alert("Insufficient balance");
        return;
      }

      await lockFunds(user.$id, fresh.stake);

      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: fresh.stake * 2
        }
      );

      goGame(updated.$id, updated.stake);

    } catch (err) {
      alert(err.message);

      try {
        await unlockFunds(user.$id, match.stake);
      } catch {}
    }

    setLoading(false);
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount < 50) {
      return alert("Minimum ₦50");
    }

    if ((wallet?.balance || 0) < amount) {
      return alert("Insufficient balance");
    }

    setLoading(true);

    try {
      await lockFunds(user.$id, amount);

      await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          gameId: ""
        }
      );

      setStake("");

    } catch (err) {
      alert(err.message);
    }

    setLoading(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎲 Dice Lobby</h1>

      {loading && <p style={styles.loading}>⚡ Processing...</p>}

      {/* ACTIVE */}
      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.length === 0 && (
        <p style={styles.empty}>No matches</p>
      )}

      {activeMatches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <div>
            <p style={styles.amount}>₦{m.stake}</p>
            <p style={styles.status}>{m.status}</p>
          </div>

          {m.status === "finished" ? (
            <button style={styles.finishedBtn} disabled>
              ✅ Finished
            </button>
          ) : (
            <button
              style={styles.resumeBtn}
              onClick={() => goGame(m.$id, m.stake)}
            >
              ▶ Play
            </button>
          )}
        </div>
      ))}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available</h2>

      {matches.length === 0 && (
        <p style={styles.empty}>No matches available</p>
      )}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span style={styles.amount}>₦{m.stake}</span>

          <button
            style={styles.joinBtn}
            onClick={() => joinMatch(m)}
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

        <button style={styles.createBtn} onClick={createMatch}>
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
    minHeight: "100vh",
    background: "linear-gradient(135deg,#020617,#0f172a)",
    color: "#fff"
  },
  title: {
    fontSize: 28,
    fontWeight: "bold"
  },
  section: {
    marginTop: 20,
    color: "#facc15"
  },
  loading: {
    color: "#facc15"
  },
  empty: {
    opacity: 0.6
  },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  amount: {
    fontWeight: "bold"
  },
  status: {
    fontSize: 12,
    opacity: 0.7
  },
  joinBtn: {
    background: "#facc15",
    padding: 8,
    border: "none",
    borderRadius: 6
  },
  resumeBtn: {
    background: "#22c55e",
    padding: 8,
    border: "none",
    borderRadius: 6,
    color: "#fff"
  },
  finishedBtn: {
    background: "#444",
    padding: 8,
    border: "none",
    borderRadius: 6,
    color: "#fff"
  },
  createBox: {
    marginTop: 20
  },
  input: {
    width: "100%",
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
    border: "none"
  },
  createBtn: {
    width: "100%",
    padding: 10,
    background: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 6
  },
  back: {
    marginTop: 20,
    padding: 10,
    background: "#475569",
    border: "none",
    borderRadius: 6,
    color: "#fff"
  }
};