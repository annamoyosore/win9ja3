import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  ID,
  Query,
  account,
} from "../lib/appwrite";

// =========================
// COLLECTIONS
// =========================
const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

// 👑 ADMIN
const ADMIN_ID = "69ef9fe863a02a7490b4";
const ADMIN_CUT_PERCENT = 10;

// =========================
// WALLET SAFE SYSTEM
// =========================
async function getOrCreateWallet(userId) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    WALLET_COLLECTION,
    [Query.equal("userId", userId)]
  );

  if (res.documents.length > 0) return res.documents[0];

  return await databases.createDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    ID.unique(),
    {
      userId,
      balance: 0,
    }
  );
}

async function deductWallet(userId, amount) {
  const wallet = await getOrCreateWallet(userId);

  const balance = Number(wallet.balance || 0);

  if (balance < amount) {
    throw new Error("INSUFFICIENT_BALANCE");
  }

  await databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: balance - amount,
    }
  );
}

// =========================
// COMPONENT
// =========================
export default function Snakelobby() {
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
      console.error("Load error:", err);
    }
  }

  // =========================
  // HOST GAME
  // =========================
  async function stakeAndHost() {
    if (!userId) return alert("Login required");

    const amount = parseInt(stake);

    if (!amount || amount <= 0) {
      return alert("Enter valid stake");
    }

    setLoading(true);

    try {
      await deductWallet(userId, amount);

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: userId,
          opponentId: null,
          stake: amount,
          status: "waiting",
          gameId: null,
        }
      );

      setStake("");
      loadLobbies();
    } catch (err) {
      if (err.message === "INSUFFICIENT_BALANCE") {
        alert("❌ Insufficient wallet balance");
      } else {
        alert("❌ Failed to create lobby");
      }

      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN GAME (FULL FIXED FLOW)
  // =========================
  async function joinLobby(lobby) {
    if (!userId) return alert("Login required");

    setLoading(true);

    try {
      // 🔥 ALWAYS REFRESH LOBBY (fix race condition)
      const freshLobby = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id
      );

      // ❌ already joined
      if (freshLobby.opponentId) {
        return alert("❌ Lobby already full");
      }

      // ❌ prevent self join
      if (freshLobby.hostId === userId) {
        return alert("❌ You cannot join your own lobby");
      }

      const stakeAmount = Number(freshLobby.stake);

      if (!stakeAmount || stakeAmount <= 0) {
        return alert("Invalid stake");
      }

      // 💰 deduct opponent
      await deductWallet(userId, stakeAmount);

      // =========================
      // POT CALCULATION
      // =========================
      const totalPot = stakeAmount * 2;
      const adminCut = Math.floor((totalPot * ADMIN_CUT_PERCENT) / 100);
      const gamePot = totalPot - adminCut;

      // 👑 UPDATE LOBBY FIRST (LOCK IT)
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id,
        {
          opponentId: userId,
          status: "active",
        }
      );

      // 🎮 CREATE GAME
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          matchId: lobby.$id,
          turn: "A",
          status: "playing",
          pot: gamePot,
          positions: JSON.stringify({ A: 1, B: 1 }),
          winner: "",
          history: JSON.stringify([]),
        }
      );

      // link game
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id,
        {
          gameId: game.$id,
        }
      );

      alert("🔥 Joined successfully!");
      loadLobbies();
    } catch (err) {
      console.error("JOIN ERROR:", err);

      if (err.message === "INSUFFICIENT_BALANCE") {
        alert("❌ Not enough balance");
      } else {
        alert("❌ Failed to join lobby");
      }
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // UI
  // =========================
  if (!userId) {
    return (
      <div style={styles.container}>
        <h2>🐍 Snake Lobby</h2>
        <p>Login required</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby (2 Players)</h2>

      <div style={styles.box}>
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

  box: {
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