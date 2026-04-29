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
const ADMIN_ID = "69ef9fe863a02a7490b4"; // ✅ your admin

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
      async () => {
        refresh(user.$id);
      }
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await loadMatches();
    await loadActiveMatches(userId);
  }

  // =========================
  // LOAD MATCHES
  // =========================
  async function loadMatches() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [Query.equal("status", "waiting")]
      );

      setMatches(res.documents || []);
    } catch (e) {
      console.log("loadMatches error", e);
      setMatches([]);
    }
  }

  // =========================
  // ACTIVE MATCHES (FIXED)
  // =========================
  async function loadActiveMatches(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION
      );

      const updated = [];

      for (let m of res.documents) {
        if (!(m.hostId === userId || m.opponentId === userId)) continue;

        // ✅ check game status
        if (m.gameId) {
          try {
            const g = await databases.getDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              m.gameId
            );

            if (g.status === "finished") {
              // ✅ force match finished
              if (m.status !== "finished") {
                await databases.updateDocument(
                  DATABASE_ID,
                  MATCH_COLLECTION,
                  m.$id,
                  { status: "finished" }
                );
              }
              continue; // ❌ don't show
            }
          } catch {}
        }

        if (m.status !== "finished") {
          updated.push(m);
        }
      }

      setActiveMatches(updated);

    } catch (e) {
      console.log("active error", e);
      setActiveMatches([]);
    }
  }

  // =========================
  // JOIN MATCH (ADMIN CUT + BLOCK SELF JOIN)
  // =========================
  async function joinMatch(match) {
    if (loading) return;
    setLoading(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      // ❌ prevent self join
      if (fresh.hostId === user.$id) {
        alert("You cannot join your own match");
        return;
      }

      if (fresh.opponentId) {
        alert("Already taken");
        return;
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        alert("No balance");
        return;
      }

      // ✅ lock full stake
      await lockFunds(user.$id, fresh.stake);

      // ✅ admin 10% cut
      const adminCut = fresh.stake * 0.1;

      await databases.createDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ID.unique(),
        {
          userId: ADMIN_ID,
          balance: adminCut
        }
      );

      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: fresh.stake * 2 - adminCut
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
      return alert("No balance");
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

      {/* ACTIVE */}
      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.length === 0 && (
        <p style={styles.empty}>No active matches</p>
      )}

      {activeMatches.map(m => (
        <div key={m.$id} style={styles.card}>
          <div>
            <p style={styles.amount}>₦{m.stake}</p>
            <p style={styles.status}>{m.status}</p>
          </div>

          <button
            style={styles.resumeBtn}
            onClick={() => {
              if (!m.gameId) return alert("Game not ready");
              goGame(m.gameId, m.stake);
            }}
          >
            ▶ Resume
          </button>
        </div>
      ))}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available</h2>

      {matches.length === 0 && (
        <p style={styles.empty}>No matches available</p>
      )}

      {matches.map(m => (
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
          onChange={e => setStake(e.target.value)}
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
  title: { fontSize: 28, fontWeight: "bold" },
  section: { marginTop: 20, color: "#facc15" },
  loading: { color: "#facc15" },
  empty: { opacity: 0.6 },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between"
  },
  amount: { fontWeight: "bold" },
  status: { fontSize: 12 },
  joinBtn: { background: "#facc15", padding: 8, borderRadius: 6 },
  resumeBtn: { background: "#22c55e", padding: 8, borderRadius: 6 },
  createBox: { marginTop: 20 },
  input: { width: "100%", padding: 10 },
  createBtn: { width: "100%", padding: 10, background: "#3b82f6" },
  back: { marginTop: 20 }
};