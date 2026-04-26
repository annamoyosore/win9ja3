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
// CREATE DECK
// =========================
function createDeck() {
  const shapes = ["circle", "triangle", "square", "star", "cross"];
  const deck = [];

  for (const shape of shapes) {
    for (let i = 1; i <= 13; i++) {
      if (i === 6 || i === 9) continue;
      deck.push({ shape, number: i });
    }
    deck.push({ shape, number: 14 });
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// CREATE GAME
// =========================
async function createGame(match) {
  const deck = createDeck();

  const game = await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: [match.hostId, match.opponentId],
      hands: JSON.stringify([
        deck.splice(0, 6),
        deck.splice(0, 6)
      ]),
      deck: JSON.stringify(deck),
      discard: JSON.stringify([deck.pop()]),
      turn: match.hostId,
      status: "running",
      winnerId: "",
      turnStartTime: new Date().toISOString()
    }
  );

  return game;
}

// =========================
// WAIT FOR GAME
// =========================
async function waitForGame(gameId) {
  while (true) {
    try {
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
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
      console.error("INIT ERROR:", err);
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

      // CREATE GAME ONCE
      if (!gameId) {
        const game = await createGame(updated);
        gameId = game.$id;

        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          updated.$id,
          { gameId }
        );
      }

      await waitForGame(gameId);

      goGame(gameId, updated.stake);

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
      setLoading(false);

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
                  onClick={() => {
                    if (!m.gameId) {
                      alert("Game not started yet");
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