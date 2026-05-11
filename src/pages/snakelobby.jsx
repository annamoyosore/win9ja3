import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query,
} from "../lib/appwrite";

const MATCH_COLLECTION = "snakelobby";
const GAME_COLLECTION = "snakegames";
const WALLET_COLLECTION = "wallets";

const ADMIN_ID = "69ef9fe863a02a7490b4";
const MIN_STAKE = 150;

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
  // LOAD MATCHES (REALTIME)
  // =========================
  useEffect(() => {
    if (!user) return;

    loadMatches();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => loadMatches()
    );

    return () => unsub();
  }, [user]);

  async function loadMatches() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    setMatches(res.documents || []);
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

  function popup(text) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  }

  // =========================
  // HOST GAME (CREATE MATCH)
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

      if (wallet.balance < stake) {
        return popup("Insufficient balance");
      }

      // deduct host stake
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - stake,
        }
      );

      // create match
      await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: "", // IMPORTANT: always empty string
          stake,
          pot: stake,
          status: "waiting",
          gameId: "",
          payoutDone: false,
        }
      );

      popup("Game created — waiting for opponent");
      setStake(MIN_STAKE);

    } catch (err) {
      console.log(err);
      popup("Failed to create match");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN GAME (SAFE + CONSISTENT)
  // =========================
  async function joinGame(match) {
    if (!user || loading) return;

    try {
      setLoading(true);

      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      // 🚫 already taken
      if (fresh.opponentId) {
        return popup("Match already joined");
      }

      if (fresh.status !== "waiting") {
        return popup("Match not available");
      }

      const wallet = await getWallet(user.$id);
      if (!wallet) return popup("Wallet not found");

      if (wallet.balance < fresh.stake) {
        return popup("Insufficient funds");
      }

      // deduct opponent stake
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - fresh.stake,
        }
      );

      // update match → matched
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: fresh.stake * 2,
        }
      );

      // create game
      const game = await databases.createDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        ID.unique(),
        {
          matchId: fresh.$id,
          hostId: fresh.hostId,
          opponentId: user.$id,
          status: "running",
          turn: fresh.hostId,
          pot: fresh.stake * 2,
          payoutDone: false,
          positions: JSON.stringify({ A: 1, B: 1 }),
        }
      );

      // link game
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          gameId: game.$id,
          status: "running",
        }
      );

      popup("Match started!");
      openGame(game.$id, fresh.$id);

    } catch (err) {
      console.log(err);
      popup("Failed to join match");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // UI FILTER RULES
  // =========================
  function canSee(match) {
    return (
      match.hostId === user?.$id ||
      match.opponentId === user?.$id ||
      match.status === "waiting"
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Matches</h2>

      {msg && <div style={styles.msg}>{msg}</div>}

      <div style={styles.hostBox}>
        <input
          type="number"
          value={stake}
          min={MIN_STAKE}
          onChange={(e) => setStake(Number(e.target.value))}
        />

        <button onClick={hostGame} disabled={loading}>
          Host Match
        </button>
      </div>

      {matches.filter(canSee).map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>₦{m.stake}</p>
          <p>Status: {m.status}</p>

          {m.status === "waiting" && !m.opponentId && (
            <button onClick={() => joinGame(m)}>
              Join
            </button>
          )}

          {m.status === "running" &&
            (m.hostId === user.$id ||
              m.opponentId === user.$id) && (
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

  hostBox: {
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
    borderRadius: 8,
    marginBottom: 10,
  },
};