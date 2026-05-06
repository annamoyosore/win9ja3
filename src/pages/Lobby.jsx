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
      turn: match.hostId,
      payoutDone: false
    }
  );
}

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);
  const [canceling, setCanceling] = useState(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    refresh(u.$id);
  }

  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => refresh(user.$id)
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await Promise.all([
      loadMatches(userId),
      loadActiveMatches(userId)
    ]);
  }

  // =========================
  // LOAD MATCHES
  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    const available = res.documents.filter(
      (m) =>
        m.status === "waiting" &&
        !m.opponentId &&
        m.hostId !== userId
    );

    setMatches(available);
  }

  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100), Query.orderDesc("$createdAt")]
    );

    const mine = res.documents.filter(
      (m) =>
        m.hostId === userId || m.opponentId === userId
    );

    setActiveMatches(mine);

    const map = {};

    await Promise.all(
      mine.map(async (m) => {
        if (!m.gameId) return;

        try {
          const g = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            m.gameId
          );
          map[m.gameId] = g;
        } catch {}
      })
    );

    setGameMap(map);
  }

  // =========================
  // LIMIT CHECK
  // =========================
  function canPlayMore() {
    const running = activeMatches.filter(
      (m) => m.status !== "finished"
    );
    return running.length < 7;
  }

  // =========================
  // CREATE MATCH (HOST PAYS)
  // =========================
  async function createMatch() {
    if (creating) return;

    if (!canPlayMore()) {
      return alert("Max 7 running matches");
    }

    const amount = Number(stake);

    if (!amount || amount < 50) {
      return alert("Minimum ₦50");
    }

    if ((wallet?.balance || 0) < amount) {
      return alert("Insufficient balance");
    }

    setCreating(true);

    try {
      // 🔹 DEDUCT HOST MONEY (LOCK)
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: Number(wallet.balance || 0) - amount
        }
      );

      // 🔹 CREATE MATCH
      await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          pot: amount, // locked
          status: "waiting",
          gameId: "",
          createdAt: new Date().toISOString()
        }
      );

      setStake("");

    } catch (err) {
      alert(err.message);
    }

    setCreating(false);
  }

  // =========================
  // JOIN MATCH (OPPONENT PAYS)
  // =========================
  async function joinMatch(match) {
    if (loadingJoin) return;

    if (!canPlayMore()) {
      return alert("Max 7 running matches reached");
    }

    setLoadingJoin(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.status !== "waiting" || fresh.opponentId) {
        throw new Error("Match already taken");
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        throw new Error("Insufficient balance");
      }

      // 🔹 DEDUCT OPPONENT MONEY
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: Number(wallet.balance || 0) - fresh.stake
        }
      );

      const total = fresh.stake * 2;
      const adminCut = Math.floor(total * 0.1);
      const finalPot = total - adminCut;

      // 🔹 ADMIN CUT
      const adminRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID), Query.limit(1)]
      );

      if (adminRes.documents.length) {
        const adminWallet = adminRes.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.$id,
          {
            balance: Number(adminWallet.balance || 0) + adminCut
          }
        );
      }

      // 🔹 UPDATE MATCH
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: finalPot
        }
      );

      const game = await createGame(fresh, user.$id);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        { gameId: game.$id }
      );

      goGame(game.$id, fresh.stake);

    } catch (err) {
      alert(err.message);
    }

    setLoadingJoin(null);
  }

  // =========================
  // CANCEL (REFUND HOST)
  // =========================
  async function cancelMatch(match) {
    if (canceling) return;

    if (match.status !== "waiting" || match.opponentId) {
      return alert("Cannot cancel");
    }

    setCanceling(match.$id);

    try {
      const walletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", match.hostId), Query.limit(1)]
      );

      if (!walletRes.documents.length) {
        throw new Error("Wallet not found");
      }

      const walletDoc = walletRes.documents[0];

      // 🔹 REFUND
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        walletDoc.$id,
        {
          balance: Number(walletDoc.balance || 0) + match.stake
        }
      );

      await databases.deleteDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

    } catch (err) {
      alert("Cancel failed");
    }

    setCanceling(null);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      <h3>
        Running: {
          activeMatches.filter(m => m.status !== "finished").length
        } / 7
      </h3>

      <h2>Your Matches</h2>

      {activeMatches.map(m => (
        <div key={m.$id} style={styles.card}>
          <div>
            <p>₦{m.stake}</p>
            <p>{m.status}</p>
          </div>

          {m.status === "finished" ? (
            <button style={styles.finishedBtn}>Finished</button>

          ) : m.gameId ? (
            <button
              style={styles.resumeBtn}
              onClick={() => goGame(m.gameId, m.stake)}
            >
              Resume
            </button>

          ) : m.hostId === user.$id &&
            m.status === "waiting" &&
            !m.opponentId ? (
            <button
              style={styles.cancelBtn}
              onClick={() => cancelMatch(m)}
            >
              {canceling === m.$id ? "Canceling..." : "Cancel"}
            </button>

          ) : (
            <span>Waiting...</span>
          )}
        </div>
      ))}

      <h2>Available Matches</h2>

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

      <input
        type="number"
        placeholder="Stake ₦"
        value={stake}
        onChange={e => setStake(e.target.value)}
        style={styles.input}
      />

      <button style={styles.createBtn} onClick={createMatch}>
        Create Match
      </button>

      <button style={styles.backBtn} onClick={back}>
        Back
      </button>
    </div>
  );
}

// =========================
// 🎨 MODERN BUTTON STYLES
// =========================
const baseBtn = {
  padding: "10px 16px",
  borderRadius: 14,
  border: "none",
  cursor: "pointer",
  fontWeight: "600"
};

const styles = {
  container: {
    padding: 20,
    background: "#020617",
    color: "#fff",
    minHeight: "100vh"
  },
  card: {
    background: "#111827",
    padding: 12,
    margin: "10px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 14
  },

  joinBtn: { ...baseBtn, background: "gold", color: "#000" },
  resumeBtn: { ...baseBtn, background: "#22c55e", color: "#fff" },
  cancelBtn: { ...baseBtn, background: "#ef4444", color: "#fff" },
  finishedBtn: { ...baseBtn, background: "#374151", color: "#aaa" },

  createBtn: {
    ...baseBtn,
    background: "#3b82f6",
    color: "#fff",
    width: "100%",
    marginTop: 10
  },

  backBtn: {
    ...baseBtn,
    background: "#6b7280",
    color: "#fff",
    width: "100%",
    marginTop: 10
  },

  input: {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    border: "none"
  }
};