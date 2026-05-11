import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query,
  SNAKE_LOBBY_COLLECTION,
  SNAKE_GAME_COLLECTION,
  WALLET_COLLECTION,
} from "../lib/appwrite";

// =========================
// ADMIN CONFIG
// =========================
const ADMIN_ID = "69ef9fe863a02a7490b4";
const ADMIN_CUT_PERCENT = 0.1;

// =========================
// MIN STAKE
// =========================
const MIN_STAKE = 150;

// =========================
// SNAKE LOBBY
// =========================
export default function SnakeLobby({ openGame, goHome }) {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState(MIN_STAKE);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // =========================
  // INIT USER
  // =========================
  useEffect(() => {
    account.get().then(setUser).catch(() => {});
  }, []);

  // =========================
  // LOAD MATCHES
  // =========================
  useEffect(() => {
    if (!user) return;

    loadMatches();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${SNAKE_LOBBY_COLLECTION}.documents`,
      () => loadMatches()
    );

    return () => unsub();
  }, [user]);

  async function loadMatches() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.limit(100)]
      );

      setMatches(res.documents || []);
    } catch (err) {
      console.log("LOAD ERROR:", err);
    }
  }

  // =========================
  // WALLET
  // =========================
  async function getWallet(uid) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", uid), Query.limit(1)]
    );

    return res.documents?.[0] || null;
  }

  // =========================
  // POPUP
  // =========================
  function popup(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  }

  // =========================
  // HOST GAME
  // =========================
  async function hostGame() {
    if (!user || loading) return;

    try {
      setLoading(true);

      if (stake < MIN_STAKE) {
        return popup("Minimum stake is ₦150");
      }

      const wallet = await getWallet(user.$id);
      if (!wallet) return popup("Wallet not found");

      if (Number(wallet.balance) < stake) {
        return popup("Insufficient balance");
      }

      // 💰 deduct host stake
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: Number(wallet.balance) - Number(stake),
        }
      );

      // 🎮 create lobby
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: "",
          stake: Number(stake),
          pot: Number(stake),
          status: "waiting",
          gameId: "",
          payoutDone: false,
        }
      );

      popup("Game created. Waiting for opponent...");
      setStake(MIN_STAKE);

    } catch (err) {
      console.log(err);
      popup("Failed to create game");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN GAME (FIXED SAFE FLOW)
  // =========================
  async function joinGame(match) {
    if (!user || loading) return;

    try {
      setLoading(true);

      // 🔒 refresh match to avoid double join
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        return popup("Already joined");
      }

      if (fresh.status !== "waiting") {
        return popup("Match not available");
      }

      const wallet = await getWallet(user.$id);
      if (!wallet) return popup("Wallet not found");

      if (Number(wallet.balance) < Number(fresh.stake)) {
        return popup("Insufficient funds");
      }

      // 💰 deduct opponent stake
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: Number(wallet.balance) - Number(fresh.stake),
        }
      );

      // =========================
      // 💰 ADMIN CUT (SAFE)
      // =========================
      const totalPot = Number(fresh.pot) + Number(fresh.stake);
      const adminCut = Math.floor(totalPot * ADMIN_CUT_PERCENT);
      const finalPot = totalPot - adminCut;

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
            balance: Number(adminWallet.balance || 0) + adminCut,
          }
        );
      }

      // =========================
      // 🎮 CREATE GAME (MOVE POT HERE)
      // =========================
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          matchId: fresh.$id,
          hostId: fresh.hostId,
          opponentId: user.$id,
          status: "running",
          turn: fresh.hostId,

          // 💰 FINAL POT MOVED INTO GAME
          pot: finalPot,

          payoutDone: false,
          positions: JSON.stringify({ A: 1, B: 1 }),
        }
      );

      // =========================
      // 🧷 UPDATE LOBBY
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "running",
          gameId: game.$id,
          pot: finalPot,
        }
      );

      popup("Match started!");

      openGame(game.$id, fresh.$id);

    } catch (err) {
      console.log("JOIN ERROR:", err);
      popup("Failed to join game");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // FILTER
  // =========================
  function canSee(m) {
    return (
      m.status === "waiting" ||
      m.hostId === user?.$id ||
      m.opponentId === user?.$id
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      {msg && <div style={styles.msg}>{msg}</div>}

      <div style={styles.box}>
        <input
          type="number"
          value={stake}
          min={MIN_STAKE}
          onChange={(e) => setStake(Number(e.target.value))}
        />

        <button onClick={hostGame} disabled={loading}>
          Host Game
        </button>
      </div>

      {matches.filter(canSee).map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>Stake: ₦{m.stake}</p>
          <p>Status: {m.status}</p>

          {m.status === "waiting" && !m.opponentId && (
            <button onClick={() => joinGame(m)} disabled={loading}>
              Join
            </button>
          )}

          {m.status === "running" &&
            (m.hostId === user?.$id ||
              m.opponentId === user?.$id) && (
              <button onClick={() => openGame(m.gameId, m.$id)}>
                Resume
              </button>
            )}
        </div>
      ))}

      <button onClick={goHome}>Exit</button>
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
    minHeight: "100vh",
  },

  box: {
    display: "flex",
    gap: 10,
    marginBottom: 20,
  },

  card: {
    background: "#111827",
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
  },

  msg: {
    background: "#dc2626",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
  },
};