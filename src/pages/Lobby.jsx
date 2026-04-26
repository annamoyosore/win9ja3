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
  const deck = [];

  for (let s of shapes) {
    for (let i = 1; i <= 13; i++) {
      deck.push(s + i);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// CREATE GAME
// =========================
async function createGame(match, opponentId) {
  let deck = createDeck();

  const hands = [
    deck.splice(0, 6),
    deck.splice(0, 6)
  ];

  const topCard = deck.pop();

  return await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: JSON.stringify([match.hostId, opponentId]),
      hands: hands.map(h => h.join(",")).join("|"),
      deck: deck.join(","),
      discard: topCard,
      turn: opponentId, // ✅ opponent starts
      status: "running",
      round: "1",
      winnerId: "",
      turnStartTime: new Date().toISOString(),
      pendingPick: "0",
      history: ""
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

    refreshAll(u.$id);
  }

  // =========================
  // REALTIME + AUTO START
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

  async function loadMatches() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.equal("status", "waiting")]
    );

    setMatches(res.documents);
  }

  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.notEqual("status", "finished")]
    );

    const mine = res.documents.filter(
      m => m.hostId === userId || m.opponentId === userId
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

      if (fresh.opponentId) return alert("Taken");

      if ((wallet?.balance || 0) < fresh.stake)
        return alert("Insufficient");

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
      await unlockFunds(user.$id, match.stake);
    }

    setLoading(false);
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount < 50) return alert("Min ₦50");

    if ((wallet?.balance || 0) < amount)
      return alert("Insufficient");

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
  }

  // =========================
  // UI (RESTORED STYLE)
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎮 Game Lobby</h1>

      {loading && <p style={styles.loading}>Processing...</p>}

      {/* ACTIVE */}
      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button
            style={styles.btn}
            onClick={() => {
              if (!m.gameId) return alert("Initializing...");
              goGame(m.gameId, m.stake);
            }}
          >
            Resume
          </button>
        </div>
      ))}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available</h2>

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button
            style={styles.join}
            onClick={() => joinMatch(m)}
          >
            Join
          </button>
        </div>
      ))}

      {/* CREATE */}
      <input
        value={stake}
        onChange={e => setStake(e.target.value)}
        style={styles.input}
      />

      <button style={styles.create} onClick={createMatch}>
        Create Match
      </button>

      <button style={styles.back} onClick={back}>
        Back
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
    background: "#0f172a",
    color: "#fff",
    minHeight: "100vh"
  },
  title: { fontSize: 28 },
  section: { marginTop: 20, color: "#facc15" },
  loading: { color: "#facc15" },
  card: {
    background: "#1e293b",
    padding: 10,
    margin: 5,
    display: "flex",
    justifyContent: "space-between"
  },
  btn: { background: "#22c55e", padding: 8 },
  join: { background: "#facc15", padding: 8 },
  input: { width: "100%", padding: 10, marginTop: 10 },
  create: { width: "100%", padding: 10, marginTop: 10 },
  back: { marginTop: 20 }
};