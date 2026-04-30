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
const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// CREATE GAME
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
      payoutDone: false,
      pot: match.pot || 0 // ✅ ensure correct pot
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
      () => refresh(user.$id)
    );

    return () => unsub();
  }, [user]);

  // =========================
  // GAME → MARK MATCH FINISHED
  // =========================
  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents`,
      async (res) => {
        const g = res.payload;

        if (g.status !== "finished") return;

        try {
          await databases.updateDocument(
            DATABASE_ID,
            MATCH_COLLECTION,
            g.matchId,
            { status: "finished" }
          );
        } catch {}

        refresh(user.$id);
      }
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await loadMatches(userId);
    await loadActiveMatches(userId);
    await autoRefund(userId);
  }

  // =========================
  // AUTO REFUND (78H)
  // =========================
  async function autoRefund(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION
    );

    const now = Date.now();

    for (let m of res.documents) {
      if (
        m.status === "waiting" &&
        m.hostId === userId &&
        !m.refunded
      ) {
        const diff =
          (now - new Date(m.$createdAt).getTime()) / (1000 * 60 * 60);

        if (diff >= 78) {
          await unlockFunds(userId, m.stake);

          await databases.updateDocument(
            DATABASE_ID,
            MATCH_COLLECTION,
            m.$id,
            { status: "cancelled", refunded: true }
          );
        }
      }
    }
  }

  // =========================
  // LOAD AVAILABLE
  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION
    );

    const available = res.documents.filter(
      (m) =>
        m.status === "waiting" &&
        m.hostId !== userId
    );

    setMatches(available);
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
      (m) =>
        (m.hostId === userId || m.opponentId === userId) &&
        m.status !== "cancelled"
    );

    setActiveMatches(mine);
  }

  // =========================
  // JOIN MATCH (FINAL FIXED)
// =========================
async function joinMatch(match) {
  if (loading) return;
  setLoading(true);

  try {
    if (match.hostId === user.$id) {
      alert("Cannot join your own match");
      return;
    }

    const fresh = await databases.getDocument(
      DATABASE_ID,
      MATCH_COLLECTION,
      match.$id
    );

    if (fresh.opponentId || fresh.status !== "waiting") {
      alert("Match not available");
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

    // 💰 PAY ADMIN ONCE
    if (!fresh.adminPaid) {
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
    }

    // ✅ Inject correct pot BEFORE game creation
    const tempMatch = {
      ...fresh,
      pot: pot
    };

    // ✅ CREATE GAME FIRST
    const game = await createGame(tempMatch, user.$id);

    // ✅ SINGLE UPDATE
    await databases.updateDocument(
      DATABASE_ID,
      MATCH_COLLECTION,
      fresh.$id,
      {
        opponentId: user.$id,
        status: "matched",
        pot: pot,
        adminCut: adminCut,
        adminPaid: true,
        gameId: game.$id
      }
    );

    goGame(game.$id, fresh.stake);

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
          adminPaid: false,
          refunded: false
        }
      );

      setStake("");

    } catch (err) {
      alert(err.message);
    }

    setLoading(false);
  }

  // =========================
  // SAFE OPEN
  // =========================
  async function safeOpenGame(match) {
    if (!match.gameId) {
      alert("Game still preparing...");
      return;
    }

    try {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        match.gameId
      );

      if (g.status === "finished") {
        alert("Game already finished");
        return;
      }

      goGame(match.gameId, match.stake);
    } catch {}
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
            <p>₦{m.stake}</p>
            <p>{m.status}</p>
          </div>

          {m.status === "finished" ? (
            <button disabled style={styles.finishedBtn}>
              ✅ Finished
            </button>
          ) : m.status === "matched" && m.gameId ? (
            <button
              style={styles.resumeBtn}
              onClick={() => safeOpenGame(m)}
            >
              ▶ Resume
            </button>
          ) : (
            <button disabled style={styles.waitingBtn}>
              ⏳ Preparing...
            </button>
          )}
        </div>
      ))}

      <h2 style={styles.section}>🎯 Available</h2>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button
            onClick={() => joinMatch(m)}
            style={styles.joinBtn}
          >
            Join
          </button>
        </div>
      ))}

      <div style={styles.createBox}>
        <input
          type="number"
          placeholder="Stake ₦"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          style={styles.input}
        />

        <button onClick={createMatch} style={styles.createBtn}>
          Create Match
        </button>
      </div>

      <button onClick={back} style={styles.back}>
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
    background: "linear-gradient(135deg,#020617,#0f172a)",
    color: "#fff",
    minHeight: "100vh"
  },
  title: { fontSize: 28, fontWeight: "bold" },
  section: { marginTop: 20, color: "#facc15" },
  loading: { color: "#facc15" },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  joinBtn: { background: "#facc15", padding: 8, border: "none" },
  resumeBtn: { background: "#22c55e", padding: 8, color: "#fff", border: "none" },
  finishedBtn: { background: "#444", padding: 8, color: "#fff", border: "none" },
  waitingBtn: { background: "#555", padding: 8, color: "#ccc", border: "none" },
  input: { width: "100%", padding: 10 },
  createBtn: { width: "100%", padding: 10, background: "#3b82f6", color: "#fff" },
  back: { marginTop: 20, padding: 10 }
};