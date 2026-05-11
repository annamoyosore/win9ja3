import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  ID,
  Query,
} from "../lib/appwrite";

import {
  SNAKE_LOBBY_COLLECTION,
  SNAKE_GAME_COLLECTION,
} from "../config/snake";

export default function SnakeLobby({ userId }) {
  const [lobbies, setLobbies] = useState([]);
  const [stake, setStake] = useState(100);
  const [creating, setCreating] = useState(false);

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
      console.error("Load lobby error:", err);
    }
  }

  // =========================
  // CREATE LOBBY (HOST)
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
          players: JSON.stringify([userId]),
          stake: Number(stake),
          pot: Number(stake),
          status: "waiting",
          gameId: "",
        }
      );

      loadLobbies();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  // =========================
  // JOIN LOBBY (OPPONENT)
  // =========================
  async function joinLobby(lobby) {
    if (!userId) return alert("Login required");

    try {
      const players = JSON.parse(lobby.players || "[]");

      if (players.includes(userId)) {
        return alert("Already joined");
      }

      if (players.length >= 2) {
        return alert("Lobby full");
      }

      const updatedPlayers = [...players, userId];
      const isFull = updatedPlayers.length === 2;

      const updatedLobby = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id,
        {
          players: JSON.stringify(updatedPlayers),
          pot: updatedPlayers.length * lobby.stake,
          status: isFull ? "active" : "waiting",
        }
      );

      // =========================
      // START GAME WHEN FULL
      // =========================
      if (isFull) {
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
            status: "active",
          }
        );

        alert("🔥 Game started!");
      }

      loadLobbies();
    } catch (err) {
      console.error("Join error:", err);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby (2 Players)</h2>

      <div style={styles.createBox}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          placeholder="Stake"
        />

        <button onClick={createLobby} disabled={creating}>
          Create Lobby
        </button>
      </div>

      <h3>Available Lobbies</h3>

      <div style={styles.list}>
        {lobbies.map((lobby) => {
          const players = JSON.parse(lobby.players || "[]");

          return (
            <div key={lobby.$id} style={styles.card}>
              <div>Host: {lobby.hostId}</div>
              <div>Stake: ₦{lobby.stake}</div>
              <div>Pot: ₦{lobby.pot}</div>
              <div>Players: {players.length}/2</div>
              <div>Status: {lobby.status}</div>

              <button onClick={() => joinLobby(lobby)}>
                Join Game
              </button>
            </div>
          );
        })}
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