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
// CREATE GAME (SAFE)
// =========================
async function createGame(match, opponentId) {
  const game = await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,

      // 🔥 STRING (NOT ARRAY)
      players: `${match.hostId},${opponentId}`,

      turn: opponentId, // opponent starts
      status: "running",

      // 🔥 MUST BE STRING (Appwrite limit fix)
      round: "1",

      discard: "c1",
      deck: "",
      hands: "",

      winnerId: "",
      turnStartTime: new Date().toISOString()
    }
  );

  console.log("✅ GAME CREATED:", game.$id);
  return game;
}

// =========================
// WAIT FOR GAME ID
// =========================
async function waitForGameId(matchId) {
  for (let i = 0; i < 10; i++) {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      MATCH_COLLECTION,
      matchId
    );

    if (fresh.gameId) {
      return fresh.gameId;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  throw new Error("Game creation timeout");
}

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

      refreshAll(u.$id);

    } catch (err) {
      console.error("INIT ERROR:", err.message);
    }
  }

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => refreshAll(user.$id)
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
  // LOAD MATCHES
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
      console.warn(err.message);
    }
  }

  // =========================
  // ACTIVE MATCHES
  // =========================
  async function loadActiveMatches(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [Query.notEqual("status", "finished")]
      );

      const myMatches = res.documents
        .filter(
          (m) =>
            m.hostId === userId ||
            m.opponentId === userId
        )
        .sort(
          (a, b) =>
            new Date(b.$updatedAt) - new Date(a.$updatedAt)
        );

      setActiveMatches(myMatches);
    } catch (err) {
      console.warn(err.message);
    }
  }

  // =========================
  // JOIN MATCH (FIXED)
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

      let gameId = updated.gameId;

      // 🔥 CREATE GAME IF NOT EXISTS
      if (!gameId) {
        const game = await createGame(updated, user.$id);
        gameId = game.$id;

        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          updated.$id,
          { gameId }
        );
      }

      // 🔥 WAIT UNTIL SAVED
      gameId = await waitForGameId(updated.$id);

      goGame(gameId, updated.stake);

    } catch (err) {
      alert(err.message);

      try {
        await unlockFunds(user.$id, match.stake);
      } catch {}

    } finally {
      setLoading(false);
    }
  }

  // =========================
  // RESUME MATCH (FIXED)
// =========================
  async function resumeMatch(m) {
    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        m.$id
      );

      // 🔥 AUTO FIX IF GAME MISSING
      if (!fresh.gameId && fresh.opponentId) {
        const game = await createGame(fresh, fresh.opponentId);

        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          fresh.$id,
          { gameId: game.$id }
        );

        return goGame(game.$id, fresh.stake);
      }

      if (fresh.gameId) {
        return goGame(fresh.gameId, fresh.stake);
      }

      alert("Waiting for opponent...");

    } catch (err) {
      alert(err.message);
    }
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

    try {
      setLoading(true);

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
          gameId: "",
          createdAt: new Date().toISOString()
        }
      );

    } catch (err) {
      alert(err.message);
    } finally {
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
            const waiting =
              m.status === "waiting" &&
              m.hostId === user?.$id;

            return (
              <div key={m.$id} style={styles.activeCard}>
                <div>
                  <p>💰 ₦{Number(m.stake).toLocaleString()}</p>
                  <p>Status: {m.status}</p>
                </div>

                <button
                  style={styles.resumeBtn}
                  onClick={() => resumeMatch(m)}
                >
                  {waiting ? "⏳ Waiting..." : "▶ Resume"}
                </button>
              </div>
            );
          })}
        </>
      )}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available Matches</h2>

      {matches.length === 0 && (
        <p style={{ opacity: 0.6 }}>
          No matches available
        </p>
      )}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>
            ₦{Number(m.stake).toLocaleString()}
          </span>

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
    justifyContent: "space-between"
  },
  activeCard: {
    background: "#1e293b",
    padding: 15,
    marginBottom: 10,
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between"
  },
  joinBtn: {
    background: "#facc15",
    padding: "8px 14px",
    borderRadius: 8,
    border: "none"
  },
  resumeBtn: {
    background: "#22c55e",
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    color: "#fff"
  },
  createBox: {
    marginTop: 25
  },
  input: {
    width: "100%",
    padding: 12,
    marginBottom: 10
  },
  createBtn: {
    width: "100%",
    padding: 12,
    background: "#3b82f6",
    border: "none",
    borderRadius: 8,
    color: "#fff"
  },
  back: {
    marginTop: 25,
    padding: 10,
    background: "#475569",
    border: "none",
    borderRadius: 8
  }
};