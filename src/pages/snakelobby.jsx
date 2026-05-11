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
// WALLET SYSTEM
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
  const [activeGame, setActiveGame] = useState(null);

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
      console.error("Lobby load error:", err);
    }
  }

  // =========================
  // LOAD ACTIVE GAME (RESUME SYSTEM)
  // =========================
  useEffect(() => {
    if (!userId) return;

    async function loadActiveGame() {
      try {
        const res = await databases.listDocuments(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          [Query.equal("status", "playing")]
        );

        const game = res.documents.find(
          (g) =>
            g.hostId === userId || g.opponentId === userId
        );

        setActiveGame(game || null);
      } catch (err) {
        console.error("Game load error:", err);
      }
    }

    loadActiveGame();
  }, [userId]);

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
  // JOIN GAME (FIXED SAFE TRANSACTION)
  // =========================
  async function joinLobby(lobby) {
    if (!userId) return alert("Login required");

    setLoading(true);

    try {
      // 🔥 always fetch fresh lobby (prevents race bugs)
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id
      );

      if (fresh.status !== "waiting") {
        return alert("❌ Game already started");
      }

      if (fresh.opponentId) {
        return alert("❌ Lobby full");
      }

      if (fresh.hostId === userId) {
        return alert("❌ You cannot join your own game");
      }

      const stakeAmount = Number(fresh.stake);

      await deductWallet(userId, stakeAmount);

      // =========================
      // POT CALCULATION
      // =========================
      const totalPot = stakeAmount * 2;
      const adminCut = Math.floor(totalPot * ADMIN_CUT_PERCENT / 100);
      const gamePot = totalPot - adminCut;

      // =========================
      // CREATE GAME FIRST (CRITICAL FIX)
      // =========================
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          matchId: fresh.$id,
          hostId: fresh.hostId,
          opponentId: userId,
          turn: "A",
          status: "playing",
          pot: gamePot,
          positions: JSON.stringify({ A: 1, B: 1 }),
          winner: "",
          history: JSON.stringify([]),
        }
      );

      if (!game) {
        throw new Error("GAME_CREATION_FAILED");
      }

      // =========================
      // LOCK LOBBY AFTER GAME CREATION
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: userId,
          status: "active",
          gameId: game.$id,
        }
      );

      alert("🔥 Game started!");
      loadLobbies();
    } catch (err) {
      console.error("JOIN ERROR:", err);

      if (err.message === "INSUFFICIENT_BALANCE") {
        alert("❌ Not enough balance");
      } else if (err.message === "GAME_CREATION_FAILED") {
        alert("❌ Game failed to start, try again");
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

      {/* 🟢 RESUME BUTTON */}
      {activeGame && (
        <button
          style={styles.resume}
          onClick={() =>
            (window.location.href = `/snakegame/${activeGame.$id}`)
          }
        >
          ▶ Resume Game
        </button>
      )}

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

  resume: {
    background: "green",
    color: "#fff",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
    border: "none",
  },
};