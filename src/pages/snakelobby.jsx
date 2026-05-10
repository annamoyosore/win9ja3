import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID
} from "../lib/appwrite";

const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

const MAX_PLAYERS = 2;
const MAX_ACTIVE = 5;

export default function SnakeLobby({ goGame, back }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [games, setGames] = useState([]);
  const [stake, setStake] = useState(200);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    init();
    const t = setInterval(loadAll, 5000);
    return () => clearInterval(t);
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      const w = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [{ method: "equal", attribute: "userId", values: [u.$id] }]
      );

      if (w.documents?.length) setWallet(w.documents[0]);

      await loadAll();
    } catch (e) {
      console.log("Init error", e);
    }
  }

  async function loadAll() {
    await loadRooms();
    await loadGames();
  }

  // =========================
  // SAFE PARSER (CRASH PROOF)
  // =========================
  function safeJSON(data, fallback) {
    try {
      if (!data) return fallback;
      if (typeof data === "object") return data;
      return JSON.parse(data);
    } catch {
      return fallback;
    }
  }

  // =========================
  // LOAD ROOMS
  // =========================
  async function loadRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION
      );

      setRooms(res.documents || []);
    } catch (e) {
      console.log("room error", e);
    }
  }

  // =========================
  // LOAD ACTIVE GAMES
  // =========================
  async function loadGames() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION
      );

      const mine = (res.documents || []).filter((g) => {
        const players = safeJSON(g.players, []);
        return players.includes(user?.$id);
      });

      setGames(mine);
    } catch (e) {
      console.log("game error", e);
    }
  }

  // =========================
  // LIMIT CHECK
  // =========================
  function canPlay() {
    return games.filter((g) => g.status !== "finished").length < MAX_ACTIVE;
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    if (!canPlay()) return setMsg("Finish games first");

    if (wallet.balance < stake) return setMsg("Low balance");

    try {
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          stake,
          players: JSON.stringify([user.$id]),
          joinedUsers: JSON.stringify({}),
          playerCount: 1,
          status: "waiting",
          gameId: ""
        }
      );

      setMsg("Room created");
      loadRooms();
    } catch (e) {
      setMsg("Create failed");
      console.log(e);
    }
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    if (!canPlay()) return setMsg("Finish games first");

    try {
      const r = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id
      );

      const players = safeJSON(r.players, []);
      const joined = safeJSON(r.joinedUsers, {});

      if (r.hostId === user.$id) return setMsg("Can't join own room");

      if (players.includes(user.$id)) return setMsg("Already joined");

      if (players.length >= MAX_PLAYERS) return setMsg("Full room");

      players.push(user.$id);
      joined[user.$id] = true;

      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          players: JSON.stringify(players),
          joinedUsers: JSON.stringify(joined),
          playerCount: players.length,
          status: players.length === MAX_PLAYERS ? "playing" : "waiting"
        }
      );

      setMsg("Joined!");

      if (r.gameId) {
        goGame?.(r.gameId);
      }

      loadAll();

    } catch (e) {
      setMsg("Join failed");
      console.log(e);
    }
  }

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <p style={{ color: "yellow" }}>{msg}</p>

      <div style={styles.card}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createRoom} style={styles.create}>
          Create Room
        </button>
      </div>

      <h3>Active Games</h3>

      {games.map((g) => (
        <div key={g.$id} style={styles.room}>
          <p>Status: {g.status}</p>

          {/* 🔥 ALWAYS SAFE RESUME */}
          <button
            style={styles.resume}
            onClick={() => goGame?.(g.$id)}
          >
            ▶ Resume
          </button>
        </div>
      ))}

      <h3>Rooms</h3>

      {rooms.map((r) => (
        <div key={r.$id} style={styles.room}>
          <p>Stake ₦{r.stake}</p>
          <button onClick={() => joinRoom(r)}>
            Join
          </button>
        </div>
      ))}

      <button onClick={back}>Back</button>
    </div>
  );
}

const styles = {
  container: {
    padding: 20,
    background: "#0f172a",
    minHeight: "100vh",
    color: "white"
  },
  card: {
    background: "#1e293b",
    padding: 15,
    borderRadius: 10
  },
  input: {
    width: "100%",
    padding: 10
  },
  create: {
    background: "orange",
    padding: 10,
    width: "100%",
    marginTop: 10
  },
  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 10
  },
  resume: {
    background: "#22c55e",
    padding: 10,
    border: "none",
    color: "white",
    borderRadius: 8
  }
};