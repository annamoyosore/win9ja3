import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  ID,
  Query,
  account,
} from "../lib/appwrite";

// 🐍 COLLECTIONS
const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";

// 👑 ADMIN SETTINGS
const ADMIN_ID = "69ef9fe863a02a7490b4";
const ADMIN_CUT_PERCENT = 10;

// =========================
// SAFE WALLET HELPERS (NO CRASH MODE)
// =========================
async function getWallet(userId) {
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      "wallets",
      [Query.equal("userId", userId)]
    );

    return res.documents?.[0] || null;
  } catch (err) {
    console.warn("Wallet fetch failed:", err.message);
    return null;
  }
}

async function updateWallet(userId, amountChange) {
  try {
    const wallet = await getWallet(userId);

    if (!wallet) {
      console.warn("Wallet not found for:", userId);
      return; // SAFE FAIL (no crash)
    }

    await databases.updateDocument(
      DATABASE_ID,
      "wallets",
      wallet.$id,
      {
        balance: wallet.balance + amountChange,
      }
    );
  } catch (err) {
    console.warn("Wallet update failed:", err.message);
  }
}

export default function SnakeLobby() {
  const [userId, setUserId] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [stake, setStake] = useState("");
  const [loading, setLoading] = useState(false);

  // =========================
  // GET USER
  // =========================
  useEffect(() => {
    account
      .get()
      .then((res) => setUserId(res.$id))
      .catch(() => setUserId(null));
  }, []);

  // =========================
  // LOAD LOBBIES
  // =========================
  useEffect(() => {
    loadLobbies();
    const interval = setInterval(loadLobbies, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadLobbies() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.equal("status", "waiting")]
      );

      setLobbies(res.documents || []);
    } catch (err) {
      console.error("LOAD ERROR:", err);
    }
  }

  // =========================
  // STAKE & HOST
  // =========================
  async function stakeAndHost() {
    if (!userId) return alert("Login required");

    const amount = parseInt(stake);

    if (!amount || amount <= 0) {
      return alert("Enter valid stake");
    }

    setLoading(true);

    try {
      // 💰 SAFE WALLET DEDUCTION
      await updateWallet(userId, -amount);

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: userId,
          opponentId: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          gameId: null,
        }
      );

      setStake("");
      loadLobbies();
    } catch (err) {
      console.error("HOST ERROR:", err);
      alert("Failed to stake & host");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN LOBBY
  // =========================
  async function joinLobby(lobby) {
    if (!userId) return alert("Login required");

    try {
      if (lobby.hostId === userId) {
        return alert("You are the host");
      }

      if (lobby.opponentId) {
        return alert("Lobby full");
      }

      const amount = lobby.stake;

      // 💰 SAFE OPPONENT DEDUCTION
      await updateWallet(userId, -amount);

      const totalPot = amount * 2;
      const adminCut = Math.floor(
        (totalPot * ADMIN_CUT_PERCENT) / 100
      );
      const gamePot = totalPot - adminCut;

      // update lobby
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id,
        {
          opponentId: userId,
          pot: gamePot,
          status: "active",
        }
      );

      // create game
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          matchId: lobby.$id,
          turn: "A",
          status: "playing",
          positions: JSON.stringify({ A: 1, B: 1 }),
          winner: "",
          history: JSON.stringify([]),
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id,
        {
          gameId: game.$id,
        }
      );

      // 👑 ADMIN CUT (SAFE)
      await updateWallet(ADMIN_ID, adminCut);

      alert("🔥 Game started!");
      loadLobbies();
    } catch (err) {
      console.error("JOIN ERROR:", err);
      alert("Failed to join lobby");
    }
  }

  // =========================
  // UI
  // =========================
  if (!userId) {
    return (
      <div style={styles.container}>
        <h2>🐍 Snake Lobby</h2>
        <p>Please login to continue</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby (2 Players)</h2>

      <div style={styles.createBox}>
        <input
          type="number"
          value={stake}
          placeholder="Enter stake"
          onChange={(e) => setStake(e.target.value)}
        />

        <button onClick={stakeAndHost} disabled={loading}>
          🎯 Stake & Host
        </button>
      </div>

      <h3>Waiting Lobbies</h3>

      <div style={styles.list}>
        {lobbies.map((lobby) => (
          <div key={lobby.$id} style={styles.card}>
            <div>Host: {lobby.hostId}</div>
            <div>Stake: ₦{lobby.stake}</div>
            <div>Pot: ₦{lobby.pot}</div>
            <div>Opponent: {lobby.opponentId ? "Joined" : "Waiting..."}</div>
            <div>Status: {lobby.status}</div>

            <button onClick={() => joinLobby(lobby)}>
              Join Game
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 15,
    background: "#0f172a",
    color: "#fff",
    minHeight: "100vh",
    textAlign: "center",
  },

  createBox: {
    display: "flex",
    gap: 10,
    justifyContent: "center",
    marginBottom: 20,
  },

  list: {
    display: "grid",
    gap: 10,
  },

  card: {
    background: "#1e293b",
    padding: 12,
    borderRadius: 10,
  },
};