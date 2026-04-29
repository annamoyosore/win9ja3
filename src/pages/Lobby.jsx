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

// ✅ SET YOUR ADMIN ID HERE
const ADMIN_ID = "69ef9fe863a02a7490b4";

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
// CREATE GAME
// =========================
async function createGame(match, opponentId) {
  const deck = createDeck();

  const hand1 = deck.splice(0, 6);
  const hand2 = deck.splice(0, 6);
  const top = deck.pop();

  return await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: `${match.hostId},${opponentId}`,
      hands: `${hand1.join(",")}|${hand2.join(",")}`,
      deck: deck.join(","),
      discard: top,
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
  // REALTIME
  // =========================
  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      async (res) => {
        refresh(user.$id);

        const m = res.payload;

        // AUTO ENTER GAME
        if (
          (m.hostId === user.$id || m.opponentId === user.$id) &&
          m.status === "matched" &&
          m.gameId
        ) {
          goGame(m.gameId, m.stake);
        }

        // AUTO SYNC FINISHED
        if (m.gameId) {
          await syncFinishedMatch(m);
        }
      }
    );

    return () => unsub();
  }, [user]);

  // =========================
  // 🔥 FIX: CHECK FINISHED ON LOAD
  // =========================
  async function syncFinishedMatch(match) {
    try {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        match.gameId
      );

      if (g.status === "finished" && match.status !== "finished") {
        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          match.$id,
          { status: "finished" }
        );
      }
    } catch (e) {
      console.log("sync error", e);
    }
  }

  async function refresh(userId) {
    await loadMatches(userId);
    await loadActiveMatches(userId);
  }

  // =========================
  // LOAD MATCHES
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
  // ACTIVE MATCHES
  // =========================
  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION
    );

    // 🔥 FIX: CHECK FINISHED ON LOAD
    for (let m of res.documents) {
      if (m.gameId) {
        await syncFinishedMatch(m);
      }
    }

    const mine = res.documents.filter(
      (m) =>
        (m.hostId === userId || m.opponentId === userId)
    );

    setActiveMatches(mine);
  }

  // =========================
  // JOIN MATCH (WITH ADMIN CUT)
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

      // 🔒 lock funds
      await lockFunds(user.$id, fresh.stake);

      const adminCut = Math.floor(fresh.stake * 0.1);
      const pot = fresh.stake * 2 - adminCut;

      // 💰 PAY ADMIN
      const adminWallet = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID)]
      );

      if (adminWallet.documents.length) {
        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.documents[0].$id,
          {
            balance:
              Number(adminWallet.documents[0].balance || 0) + adminCut
          }
        );
      }

      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: pot,
          adminPaid: true
        }
      );

      const game = await createGame(updated, user.$id);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        updated.$id,
        { gameId: game.$id }
      );

      goGame(game.$id, updated.stake);

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
          gameId: "",
          adminPaid: false
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
      <h1 style={styles.title}>🎮 Game Lobby</h1>

      {loading && <p style={styles.loading}>⚡ Processing...</p>}

      <h2 style={styles.section}>🔥 Your Matches</h2>

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
              onClick={() => goGame(m.gameId, m.stake)}
            >
              ▶ Resume
            </button>
          )}
        </div>
      ))}

      <h2 style={styles.section}>🎯 Available</h2>

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
  container: { padding: 20, minHeight: "100vh", background: "#020617", color: "#fff" },
  title: { fontSize: 28, fontWeight: "bold" },
  section: { marginTop: 20, color: "#facc15" },
  loading: { color: "#facc15" },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between"
  },
  amount: { fontWeight: "bold" },
  status: { fontSize: 12 },
  joinBtn: { background: "gold", padding: 8 },
  resumeBtn: { background: "green", padding: 8, color: "#fff" },
  finishedBtn: { background: "#444", padding: 8, color: "#fff" },
  createBox: { marginTop: 20 },
  input: { width: "100%", padding: 10 },
  createBtn: { width: "100%", padding: 10, background: "blue", color: "#fff" },
  back: { marginTop: 20, padding: 10 }
};