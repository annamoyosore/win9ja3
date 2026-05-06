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

  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    setMatches(
      res.documents.filter(
        m => m.status === "waiting" && !m.opponentId && m.hostId !== userId
      )
    );
  }

  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100), Query.orderDesc("$createdAt")]
    );

    const mine = res.documents.filter(
      m => m.hostId === userId || m.opponentId === userId
    );

    setActiveMatches(mine);

    const map = {};
    await Promise.all(
      mine.map(async m => {
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

  function canPlayMore() {
    return activeMatches.filter(m => m.status !== "finished").length < 7;
  }

  // =========================
  // CREATE MATCH (LOCK FUNDS)
  // =========================
  async function createMatch() {
    if (creating) return;

    const amount = Number(stake);

    if (!amount || amount < 50) {
      return alert("Minimum ₦50");
    }

    setCreating(true);

    try {
      // 🔄 fresh wallet
      const walletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", user.$id), Query.limit(1)]
      );

      const freshWallet = walletRes.documents[0];

      if (!freshWallet) throw new Error("Wallet not found");

      if ((freshWallet.balance || 0) < amount) {
        throw new Error("Insufficient balance");
      }

      // 🔒 lock funds
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          balance: freshWallet.balance - amount,
          locked: (freshWallet.locked || 0) + amount
        }
      );

      // 🎮 create match
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

      setStake("");
      refresh(user.$id);

    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  // =========================
  // CANCEL MATCH (REFUND + DELETE)
  // =========================
  async function cancelMatch(match) {
    if (canceling) return;

    setCanceling(match.$id);

    try {
      const walletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", user.$id), Query.limit(1)]
      );

      const freshWallet = walletRes.documents[0];
      if (!freshWallet) throw new Error("Wallet not found");

      // 💰 refund
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          balance: freshWallet.balance + match.stake,
          locked: Math.max((freshWallet.locked || 0) - match.stake, 0)
        }
      );

      // 🗑 delete match
      await databases.deleteDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      refresh(user.$id);

    } catch (err) {
      alert("Cancel failed: " + err.message);
    } finally {
      setCanceling(null);
    }
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loadingJoin) return;

    setLoadingJoin(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if ((wallet.balance || 0) < fresh.stake) {
        throw new Error("Insufficient balance");
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - fresh.stake,
          locked: (wallet.locked || 0) + fresh.stake
        }
      );

      const game = await createGame(fresh, user.$id);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          gameId: game.$id
        }
      );

      goGame(game.$id, fresh.stake);

    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingJoin(null);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      <h2>🔥 Your Matches</h2>

      {activeMatches.map(m => {
        const game = gameMap[m.gameId];

        const isFinished =
          m.status === "finished" || game?.status === "finished";

        const turnLabel =
          !isFinished && game
            ? game.turn === user.$id
              ? "🟢 Your Turn"
              : "🔴 Opponent Turn"
            : "";

        return (
          <div key={m.$id} style={styles.card}>
            <div>
              <p>₦{m.stake}</p>
              <p>{m.status}</p>
              {turnLabel && <p>{turnLabel}</p>}
            </div>

            {isFinished ? (
              <button style={styles.finishedBtn} disabled>
                Finished
              </button>
            ) : m.status === "waiting" && m.hostId === user.$id ? (
              <button
                style={styles.cancelBtn}
                onClick={() => cancelMatch(m)}
              >
                {canceling === m.$id ? "Canceling..." : "Cancel"}
              </button>
            ) : m.gameId ? (
              <button
                style={styles.resumeBtn}
                onClick={() => goGame(m.gameId, m.stake)}
              >
                Resume
              </button>
            ) : null}
          </div>
        );
      })}

      <h2>🎯 Available</h2>

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button
            onClick={() => joinMatch(m)}
            disabled={loadingJoin === m.$id}
            style={styles.joinBtn}
          >
            {loadingJoin === m.$id ? "Joining..." : "Join"}
          </button>
        </div>
      ))}

      <input
        type="number"
        placeholder="Stake ₦"
        value={stake}
        onChange={e => setStake(e.target.value)}
      />

      <button
        onClick={createMatch}
        disabled={creating}
        style={{
          ...styles.createBtn,
          opacity: creating ? 0.6 : 1,
          cursor: creating ? "not-allowed" : "pointer"
        }}
      >
        {creating ? "Creating..." : "Create Match"}
      </button>

      <button onClick={back}>Back</button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: { padding: 20, background: "#020617", color: "#fff" },
  card: {
    background: "#111827",
    padding: 12,
    margin: "10px 0",
    display: "flex",
    justifyContent: "space-between",
    borderRadius: 10
  },
  joinBtn: {
    background: "#facc15",
    padding: "6px 14px",
    borderRadius: 8
  },
  resumeBtn: {
    background: "#22c55e",
    padding: "6px 14px",
    borderRadius: 8,
    color: "#fff"
  },
  cancelBtn: {
    background: "#ef4444",
    padding: "6px 14px",
    borderRadius: 8,
    color: "#fff"
  },
  finishedBtn: {
    background: "#374151",
    padding: "6px 14px",
    borderRadius: 8,
    color: "#9ca3af"
  },
  createBtn: {
    marginTop: 10,
    background: "#2563eb",
    padding: "10px 16px",
    borderRadius: 8,
    color: "#fff",
    border: "none"
  }
};