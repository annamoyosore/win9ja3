import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";

const ADMIN_CUT_PERCENT = 12;
const MIN_STAKE = 150;

// =========================
// WALLET SAFE FETCH
// =========================
async function getWallet(userId) {
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId), Query.limit(1)]
    );

    return res.documents?.[0] || null;
  } catch (err) {
    console.error("Wallet error:", err);
    return null;
  }
}

export default function Snakelobby({ goGame }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState("");

  const [waiting, setWaiting] = useState([]);
  const [active, setActive] = useState([]);

  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(null);

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

      const w = await getWallet(u.$id);
      setWallet(w);

      await loadLobbies(u.$id);
    } catch (err) {
      console.error("Init error:", err);
    }
  }

  // =========================
  // LOAD LOBBIES
  // =========================
  async function loadLobbies(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.limit(100)]
      );

      const all = res.documents;

      // 🟡 WAITING → PUBLIC (everyone sees)
      const waitingLobbies = all.filter(
        (m) => (m.status || "") === "waiting"
      );

      // 🟢 MATCHED → ONLY HOST + OPPONENT SEE
      const activeGames = all.filter((m) => {
        return (
          m.status === "matched" &&
          m.gameId &&
          (m.hostId === userId || m.opponentId === userId)
        );
      });

      setWaiting(waitingLobbies);
      setActive(activeGames);

    } catch (err) {
      console.error("Load error:", err);
    }
  }

  // =========================
  // CREATE LOBBY
  // =========================
  async function createLobby() {
    const amount = Number(stake);

    if (!amount || amount < MIN_STAKE) {
      return alert(`Minimum stake is ₦${MIN_STAKE}`);
    }

    if (!wallet || wallet.balance < amount) {
      return alert("Insufficient balance");
    }

    setLoadingCreate(true);

    try {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - amount
        }
      );

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          status: "waiting",
          gameId: null,
          pot: amount,
          refundDone: false
        }
      );

      setStake("");
      await loadLobbies(user.$id);

    } catch (err) {
      console.error(err);
      alert(err.message);
    }

    setLoadingCreate(false);
  }

  // =========================
  // JOIN LOBBY → MATCHED → GAME CREATED
  // =========================
  async function joinLobby(lobby) {
    if (loadingJoin) return;

    setLoadingJoin(lobby.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id
      );

      if (fresh.hostId === user.$id) {
        throw new Error("Cannot join your own lobby");
      }

      if (fresh.opponentId) {
        throw new Error("Already matched");
      }

      const amount = Number(fresh.stake);

      const freshWallet = await getWallet(user.$id);

      if (!freshWallet || freshWallet.balance < amount) {
        throw new Error("Insufficient balance");
      }

      // 💰 deduct wallet
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          balance: freshWallet.balance - amount
        }
      );

      // 🔒 SET MATCHED
      const matchedLobby = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched"
        }
      );

      const total = amount * 2;
      const adminCut = Math.floor((total * ADMIN_CUT_PERCENT) / 100);
      const finalPot = total - adminCut;

      // 🎮 CREATE GAME
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          lobbyId: matchedLobby.$id,
          hostId: matchedLobby.hostId,
          opponentId: user.$id,
          status: "running",
          turn: matchedLobby.hostId,
          pot: finalPot,
          payoutDone: false
        }
      );

      // 🔗 LINK GAME
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        matchedLobby.$id,
        {
          gameId: game.$id,
          pot: finalPot
        }
      );

      goGame(game.$id, amount);

    } catch (err) {
      alert(err.message);
    }

    setLoadingJoin(null);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <input
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake (min ₦150)"
      />

      <button onClick={createLobby} disabled={loadingCreate}>
        {loadingCreate ? "Creating..." : "Create Lobby"}
      </button>

      {/* 🟡 WAITING (PUBLIC) */}
      <h3>Waiting Lobbies</h3>

      {waiting.length === 0 && <p>No lobbies available</p>}

      {waiting.map((l) => (
        <div key={l.$id} style={styles.card}>
          <div>
            <p>₦{l.stake}</p>
            {l.hostId === user.$id ? (
              <p>⏳ Waiting for opponent...</p>
            ) : (
              <p>🟢 Available</p>
            )}
          </div>

          {l.hostId !== user.$id && (
            <button
              onClick={() => joinLobby(l)}
              disabled={loadingJoin === l.$id}
            >
              Join
            </button>
          )}
        </div>
      ))}

      {/* 🟢 ACTIVE (PRIVATE MATCHED ONLY) */}
      <h3>Active Games</h3>

      {active.length === 0 && <p>No active games</p>}

      {active.map((l) => (
        <div key={l.$id} style={styles.card}>
          <div>
            <p>₦{l.stake}</p>
            <p>Matched Game</p>
          </div>

          {(l.hostId === user.$id || l.opponentId === user.$id) && l.gameId && (
            <button onClick={() => goGame(l.gameId, l.stake)}>
              ▶ Resume
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// =========================
// STYLE
// =========================
const styles = {
  container: {
    padding: 20,
    background: "#0f172a",
    color: "#fff",
    minHeight: "100vh"
  },

  card: {
    background: "#1e293b",
    padding: 12,
    margin: 10,
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }
};