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

const GAME_COLLECTION = "dice_games";

// 🔥 YOUR ADMIN ID
const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// CREATE GAME (DICE)
// =========================
async function createGame(match, opponentId) {
  return await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: `${match.hostId},${opponentId}`,
      status: "running",
      winnerId: "",
      hostRoll: 0,
      opponentRoll: 0,
      turn: match.hostId,
      createdAt: new Date().toISOString()
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
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    refresh(u.$id);
  }

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      async (res) => {
        const m = res.payload;

        refresh(user.$id);

        // AUTO ENTER GAME
        if (
          (m.hostId === user.$id || m.opponentId === user.$id) &&
          m.status === "matched" &&
          m.gameId
        ) {
          goGame(m.gameId, m.stake);
        }

        // AUTO MARK FINISHED
        if (m.gameId) {
          try {
            const g = await databases.getDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              m.gameId
            );

            if (g.status === "finished" && m.status !== "finished") {
              await databases.updateDocument(
                DATABASE_ID,
                MATCH_COLLECTION,
                m.$id,
                { status: "finished" }
              );
            }
          } catch {}
        }
      }
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await loadMatches(userId);
    await loadActiveMatches(userId);
  }

  // =========================
  // LOAD AVAILABLE
  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.equal("status", "waiting")]
    );

    // ❌ remove own matches
    const filtered = res.documents.filter(m => m.hostId !== userId);

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

    const mine = res.documents.filter(
      m =>
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

      // 🔒 Lock opponent funds
      await lockFunds(user.$id, fresh.stake);

      const total = fresh.stake * 2;
      const adminCut = Math.floor(total * 0.1);
      const pot = total - adminCut;

      // 💰 PAY ADMIN
      const adminWallet = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID)]
      );

      if (adminWallet.documents.length) {
        const admin = adminWallet.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          admin.$id,
          {
            balance: Number(admin.balance || 0) + adminCut
          }
        );
      }

      // UPDATE MATCH
      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: pot
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

      {loading && <p style={styles.loading}>Processing...</p>}

      {/* ACTIVE */}
      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.map(m => (
        <div key={m.$id} style={styles.card}>
          <div>
            <p>₦{m.stake}</p>
            <p>{m.status}</p>
          </div>

          {m.status === "finished" ? (
            <button style={styles.finishedBtn} disabled>Finished</button>
          ) : (
            <button
              style={styles.resumeBtn}
              onClick={() => goGame(m.gameId, m.stake)}
            >
              Resume
            </button>
          )}
        </div>
      ))}

      {/* AVAILABLE */}
      <h2 style={styles.section}>🎯 Available</h2>

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

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
          placeholder="Stake ₦"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
        />

        <button onClick={createMatch}>Create Match</button>
      </div>

      <button onClick={back}>Back</button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: { padding: 20, color: "#fff", background: "#020617", minHeight: "100vh" },
  title: { fontSize: 26 },
  section: { marginTop: 20 },
  loading: { color: "gold" },
  card: {
    background: "#111827",
    padding: 12,
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between"
  },
  joinBtn: { background: "gold", padding: 6 },
  resumeBtn: { background: "green", padding: 6, color: "#fff" },
  finishedBtn: { background: "#444", padding: 6 },
  createBox: { marginTop: 20 }
};