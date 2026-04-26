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
// HELPERS
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

async function createGame(match) {
  const deck = createDeck();

  return databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    match.$id,
    {
      players: [match.hostId, match.opponentId],
      hands: JSON.stringify([deck.splice(0, 6), deck.splice(0, 6)]),
      deck: JSON.stringify(deck),
      discard: JSON.stringify([deck.pop()]),
      scores: JSON.stringify({ p1: 0, p2: 0 }),
      round: 1,
      turn: match.hostId,
      status: "running",
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
  }

  // =========================
  // LOAD WAITING MATCHES
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
  // LOAD ACTIVE MATCHES (🔥 FIX)
  // =========================
  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.or([
          Query.equal("hostId", userId),
          Query.equal("opponentId", userId)
        ]),
        Query.notEqual("status", "finished")
      ]
    );

    setActiveMatches(res.documents);
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

      // create game (only one succeeds)
      try {
        await createGame({
          ...fresh,
          opponentId: user.$id
        });
      } catch {}

      goGame(fresh.$id, fresh.stake);

    } catch (err) {
      alert(err.message);
      await unlockFunds(user.$id, match.stake);
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
          opponentId: "",
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

      {loading && <p style={styles.loading}>⚡ Matching...</p>}

      {/* 🔥 ACTIVE MATCHES */}
      {activeMatches.length > 0 && (
        <>
          <h2 style={styles.section}>🔥 Your Active Games</h2>

          {activeMatches.map((m) => (
            <div key={m.$id} style={styles.activeCard}>
              <p>💰 ₦{Number(m.stake).toLocaleString()}</p>
              <p>Status: {m.status}</p>

              <button
                style={styles.resumeBtn}
                onClick={() => goGame(m.$id, m.stake)}
              >
                ▶ Resume Game
              </button>
            </div>
          ))}
        </>
      )}

      {/* AVAILABLE MATCHES */}
      <h2 style={styles.section}>🎯 Available Matches</h2>

      {matches.length === 0 && (
        <p style={{ opacity: 0.6 }}>No matches yet</p>
      )}

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
// STYLES (🔥 UPGRADED UI)
// =========================
const styles = {
  container: {
    padding: 20,
    background: "linear-gradient(135deg,#0f172a,#020617)",
    minHeight: "100vh",
    color: "#fff"
  },
  title: {
    fontSize: 28,
    marginBottom: 10
  },
  section: {
    marginTop: 25,
    marginBottom: 10,
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
    justifyContent: "space-between",
    alignItems: "center"
  },
  activeCard: {
    background: "#1e293b",
    padding: 15,
    marginBottom: 10,
    borderRadius: 10
  },
  joinBtn: {
    padding: 10,
    background: "gold",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },
  resumeBtn: {
    padding: 10,
    background: "#22c55e",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    marginTop: 5
  },
  createBox: {
    marginTop: 20
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 6,
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