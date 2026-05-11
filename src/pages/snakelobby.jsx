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

export default function SnakeLobby() {
  const [userId, setUserId] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [stake, setStake] = useState(100);
  const [creating, setCreating] = useState(false);

  // =========================
  // GET LOGGED IN USER
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
      console.error(err);
    }
  }

  // =========================
  // CREATE LOBBY
  // =========================
  async function createLobby() {
    if (!userId) return alert("Login required");

    setCreating(true);

    try {
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: userId,
          opponentId: null,
          stake: Number(stake),
          pot: Number(stake),
          status: "waiting",
          gameId: null,
        }
      );

      loadLobbies();
    } catch (err) {
      console.error("Create error:", err);
    } finally {
      setCreating(false);
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
        return alert("Lobby already full");
      }

      // 💰 POT + ADMIN CUT
      const totalPot = lobby.stake * 2;
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
          positions: JSON.stringify({
            A: 1,
            B: 1,
          }),
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

      // 👑 ADMIN WALLET ENTRY
      await databases.createDocument(
        DATABASE_ID,
        "wallets",
        ID.unique(),
        {
          userId: ADMIN_ID,
          amount: adminCut,
          type: "admin_cut",
          source: "snake_game",
        }
      );

      alert("🔥 Game started!");

      loadLobbies();
    } catch (err) {
      console.error("Join error:", err);
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
          onChange={(e) => setStake(e.target.value)}
        />

        <button onClick={createLobby} disabled={creating}>
          Create Lobby
        </button>
      </div>

      <h3>Waiting Lobbies</h3>

      <div style={styles.list}>
        {lobbies.map((lobby) => (
          <div key={lobby.$id} style={styles.card}>
            <div>Host: {lobby.hostId}</div>
            <div>Stake: ₦{lobby.stake}</div>
            <div>Pot: ₦{lobby.pot}</div>

            <div>
              Opponent:{" "}
              {lobby.opponentId ? "Joined" : "Waiting..."}
            </div>

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