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
// CREATE GAME (OPPONENT STARTS)
// =========================
async function createGame(match) {
  const shapes = ["circle", "triangle", "square", "star", "cross"];

  const randomCard =
    shapes[Math.floor(Math.random() * shapes.length)] +
    "_" +
    Math.floor(Math.random() * 13 + 1);

  const game = await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: [match.hostId, match.opponentId],

      handCounts: JSON.stringify([6, 6]),
      topCard: randomCard,

      // 🔥 opponent starts first
      turn: match.opponentId,

      status: "running",
      winnerId: "",
      round: 1,
      turnStartTime: new Date().toISOString()
    }
  );

  return game;
}

// =========================
// WAIT FOR GAME
// =========================
async function waitForGame(gameId) {
  let tries = 0;

  while (tries < 10) {
    try {
      return await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );
    } catch {
      await new Promise((r) => setTimeout(r, 500));
      tries++;
    }
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
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    refreshAll(u.$id);
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
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("status", "waiting"),
        Query.orderDesc("$createdAt")
      ]
    );

    setMatches(res.documents);
  }

  // =========================
  // ACTIVE MATCHES
  // =========================
  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.notEqual("status", "finished")]
    );

    const myMatches = res.documents.filter(
      (m) =>
        m.hostId === userId ||
        m.opponentId === userId
    );

    setActiveMatches(myMatches);
  }

  // =========================
  // JOIN MATCH (FINAL FIX)
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

      // 🔥 SET TO RUNNING
      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "running",
          pot: fresh.stake * 2
        }
      );

      // 🔥 ALWAYS CREATE GAME HERE
      const game = await createGame(updated);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        updated.$id,
        { gameId: game.$id }
      );

      await waitForGame(game.$id);

      goGame(game.$id, updated.stake);

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

      alert("Match created. Waiting for opponent...");
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
      {activeMatches.map((m) => {
        const waiting =
          m.status === "waiting" &&
          m.hostId === user?.$id;

        return (
          <div key={m.$id} style={styles.activeCard}>
            <div>
              <p>💰 ₦{m.stake}</p>
              <p>Status: {m.status}</p>
            </div>

            <button
              style={styles.resumeBtn}
              onClick={() => {
                if (!m.gameId) {
                  alert("Waiting for opponent...");
                  return;
                }
                goGame(m.gameId, m.stake);
              }}
            >
              {waiting ? "⏳ Waiting..." : "▶ Resume"}
            </button>
          </div>
        );
      })}

      {/* AVAILABLE */}
      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

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