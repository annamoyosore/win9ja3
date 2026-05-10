import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query
} from "../lib/appwrite";

const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

const ADMIN_USER_ID = "69ef9fe863a02a7490b4";
const MAX_PLAYERS = 2;
const MAX_ACTIVE_GAMES = 5;
const ADMIN_CUT_PERCENT = 0.1;

export default function SnakeLobby({ goGame, back }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState(200);
  const [rooms, setRooms] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    init();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    await loadAll();
  }

  async function loadAll() {
    await loadRooms();
    await loadActiveGames();
  }

  // =========================
  // ACTIVE GAMES (FIXED)
  // =========================
  async function loadActiveGames() {
    if (!user) return;

    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION,
      [Query.limit(100)]
    );

    const mine = res.documents.filter((g) => {
      try {
        const players = JSON.parse(g.players || "[]");
        return players.includes(user.$id);
      } catch {
        return false;
      }
    });

    setActiveGames(mine);
  }

  // =========================
  // ROOMS
  // =========================
  async function loadRooms() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      [Query.limit(100)]
    );

    setRooms(res.documents);
  }

  // =========================
  // LIMIT
  // =========================
  function canPlayMore() {
    const running = activeGames.filter(
      (g) => g.status !== "finished"
    );
    return running.length < MAX_ACTIVE_GAMES;
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    if (!canPlayMore()) {
      return setMessage("Finish current games first (max 5 active)");
    }

    if (stake < 200) {
      return setMessage("Minimum ₦200");
    }

    if (wallet.balance < stake) {
      return setMessage("Insufficient balance");
    }

    const u = await account.get();

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: wallet.balance - stake }
    );

    await databases.createDocument(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      ID.unique(),
      {
        hostId: u.$id,
        stake,
        players: JSON.stringify([u.$id]),
        joinedUsers: JSON.stringify({ [u.$id]: true }),
        playerCount: 1,
        status: "waiting",
        gameId: ""
      }
    );

    setMessage("Room created");
    loadAll();
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    if (!canPlayMore()) {
      return setMessage("Finish a game first (max 5 active)");
    }

    const u = await account.get();

    if (room.hostId === u.$id) {
      return setMessage("Cannot join your own room");
    }

    const fresh = await databases.getDocument(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      room.$id
    );

    let players = JSON.parse(fresh.players || "[]");
    let joinedUsers = JSON.parse(fresh.joinedUsers || "{}");

    if (players.includes(u.$id)) {
      return setMessage("Already joined");
    }

    if (players.length >= MAX_PLAYERS) {
      return setMessage("Room full");
    }

    if (wallet.balance < fresh.stake) {
      return setMessage("Insufficient balance");
    }

    players.push(u.$id);
    joinedUsers[u.$id] = true;

    await databases.updateDocument(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      fresh.$id,
      {
        players: JSON.stringify(players),
        joinedUsers: JSON.stringify(joinedUsers),
        playerCount: players.length,
        status: players.length === MAX_PLAYERS ? "playing" : "waiting"
      }
    );

    setMessage("Joined successfully");
    loadAll();

    // 👉 IF GAME EXISTS, ALWAYS ALLOW RESUME
    if (fresh.gameId) {
      goGame(fresh.gameId);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <p style={{ color: "yellow" }}>{message}</p>

      {/* CREATE ROOM */}
      <div style={styles.card}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button style={styles.createBtn} onClick={createRoom}>
          Create Room
        </button>
      </div>

      {/* ACTIVE GAMES (🔥 FIXED RESUME SECTION) */}
      <h3>🎮 Your Active Games</h3>

      {activeGames.length === 0 && (
        <p>No active games yet</p>
      )}

      {activeGames.map((g) => (
        <div key={g.$id} style={styles.room}>
          <p>Game ID: {g.$id}</p>
          <p>Status: {g.status || "playing"}</p>

          {/* 🔥 ALWAYS SHOW RESUME IF GAME EXISTS */}
          <button
            style={styles.resumeBtn}
            onClick={() => goGame(g.$id)}
          >
            ▶ Resume Game
          </button>
        </div>
      ))}

      {/* ROOMS */}
      <h3>Available Rooms</h3>

      {rooms.map((r) => {
        const players = JSON.parse(r.players || "[]");

        return (
          <div key={r.$id} style={styles.room}>
            <p>Stake: ₦{r.stake}</p>
            <p>Players: {players.length}/{MAX_PLAYERS}</p>

            <button onClick={() => joinRoom(r)}>
              Join
            </button>
          </div>
        );
      })}

      <button onClick={back}>Back</button>
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
    color: "white",
    minHeight: "100vh"
  },
  card: {
    background: "#1e293b",
    padding: 15,
    borderRadius: 10
  },
  input: {
    width: "100%",
    padding: 10,
    marginBottom: 10
  },
  createBtn: {
    background: "orange",
    padding: 10,
    border: "none",
    width: "100%",
    marginTop: 10,
    fontWeight: "bold"
  },
  resumeBtn: {
    background: "#22c55e",
    padding: "10px 16px",
    border: "none",
    borderRadius: 10,
    fontWeight: "bold",
    marginTop: 8,
    color: "white"
  },
  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 8
  }
};