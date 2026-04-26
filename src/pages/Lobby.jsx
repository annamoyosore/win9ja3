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
// CREATE GAME (STRING SAFE)
// =========================
async function createGame(match, opponentId) {
  return await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,

      // ✅ STRING (NOT ARRAY)
      players: `${match.hostId},${opponentId}`,

      hands: "",
      deck: "",
      discard: "c1",

      turn: opponentId,
      status: "running",
      round: "1",

      winnerId: "",
      turnStartTime: new Date().toISOString()
    }
  );
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

      try {
        const w = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", u.$id)]
        );

        setWallet(w.documents?.[0] || null);
      } catch {
        setWallet(null);
      }

      await refreshAll(u.$id);

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
    try {
      await Promise.all([
        loadMatches(),
        loadActiveMatches(userId)
      ]);
    } catch (err) {
      console.warn("Refresh error:", err.message);
    }
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

      setMatches(res.documents || []);
    } catch {
      setMatches([]);
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

      const myMatches = (res.documents || []).filter(
        (m) =>
          m.hostId === userId ||
          m.opponentId === userId
      );

      setActiveMatches(myMatches);

    } catch {
      setActiveMatches([]);
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

    if (fresh.gameId) {
      goGame(fresh.gameId, fresh.stake);
      return;
    }

    alert("Game still initializing...");

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
  // SAFE RENDER
  // =========================
  if (!user) {
    return <div style={styles.container}>Loading user...</div>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎮 Game Lobby</h1>

      {loading && <p style={styles.loading}>⚡ Processing...</p>}

      {/* ACTIVE */}
      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.length === 0 && (
        <p>No active matches</p>
      )}

      {activeMatches.map((m) => (
        <div key={m.$id} style={styles.activeCard}>
          <div>
            <p>💰 ₦{Number(m.stake).toLocaleString()}</p>
            <p>Status: {m.status}</p>
          </div>

          <button
            style={styles.resumeBtn}
            onClick={() => resumeMatch(m)}
          >
            ▶ Resume
          </button>
        </div>
      ))}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available Matches</h2>

      {matches.length === 0 && (
        <p>No matches available</p>
      )}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>₦{Number(m.stake).toLocaleString()}</span>

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

        <button
          style={styles.createBtn}
          onClick={createMatch}
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