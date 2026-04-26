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
  const shapes = ["c", "t", "s", "r", "x"];
  let deck = [];

  for (let s of shapes) {
    for (let i = 1; i <= 13; i++) {
      deck.push(s + i);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// CREATE GAME (SAFE)
// =========================
async function createGame(match, opponentId) {
  let deck = createDeck();

  const hands = [
    deck.splice(0, 6),
    deck.splice(0, 6)
  ];

  const topCard = deck.pop();

  const game = await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,

      // ✅ ALWAYS STRING
      players: JSON.stringify([match.hostId, opponentId]),

      // ✅ NEVER EMPTY
      hands: hands.map(h => h.join(",")).join("|"),
      deck: deck.join(","),
      discard: topCard,

      turn: opponentId, // 🔥 opponent starts
      status: "running",
      round: "1",
      winnerId: "",

      pendingPick: "0",
      history: "",

      turnStartTime: new Date().toISOString()
    }
  );

  return game;
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
      console.error(err.message);
    }
  }

  // =========================
  // REALTIME (AUTO START GAME)
// =========================
useEffect(() => {
  if (!user) return;

  const unsub = databases.client.subscribe(
    `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
    (res) => {
      const m = res.payload;

      refreshAll(user.$id);

      // 🔥 AUTO ENTER GAME
      if (
        (m.hostId === user.$id || m.opponentId === user.$id) &&
        m.status === "matched" &&
        m.gameId
      ) {
        goGame(m.gameId, m.stake);
      }
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

    const mine = res.documents
      .filter(
        m =>
          m.hostId === userId ||
          m.opponentId === userId
      )
      .sort(
        (a, b) =>
          new Date(b.$updatedAt) -
          new Date(a.$updatedAt)
      );

    setActiveMatches(mine);
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

      // 🔥 VERIFY GAME EXISTS BEFORE NAV
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      goGame(gameId, updated.stake);

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
    }

    setLoading(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎮 Game Lobby</h1>

      {loading && (
        <p style={styles.loading}>⚡ Processing...</p>
      )}

      {/* ACTIVE */}
      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>
            ₦{Number(m.stake).toLocaleString()}
          </span>

          <button
            style={styles.resumeBtn}
            onClick={async () => {
              if (!m.gameId) {
                alert("Game initializing...");
                return;
              }

              try {
                await databases.getDocument(
                  DATABASE_ID,
                  GAME_COLLECTION,
                  m.gameId
                );

                goGame(m.gameId, m.stake);

              } catch {
                alert("Game not ready yet");
              }
            }}
          >
            ▶ Resume
          </button>
        </div>
      ))}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available</h2>

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>
            ₦{Number(m.stake).toLocaleString()}
          </span>

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
          onChange={e => setStake(e.target.value)}
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