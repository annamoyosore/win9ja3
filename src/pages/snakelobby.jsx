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
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [{ method: "equal", attribute: "userId", values: [u.$id] }]
    );

    if (w.documents?.length) setWallet(w.documents[0]);

    await loadAll();
  }

  async function loadAll() {
    await loadRooms();
    await loadGames();
  }

  // =========================
  // SAFE PARSER
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
  // LOAD ROOMS (FIXED VISIBILITY)
  // =========================
  async function loadRooms() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION
    );

    const filtered = (res.documents || []).filter((r) => {
      const players = safeJSON(r.players, []);

      // ✅ ONLY:
      // - public waiting rooms
      // - OR rooms user is inside
      return (
        r.status === "waiting" ||
        players.includes(user?.$id)
      );
    });

    setRooms(filtered);
  }

  // =========================
  // LOAD GAMES (PRIVATE ONLY)
  // =========================
  async function loadGames() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION
    );

    const mine = (res.documents || []).filter((g) => {
      const players = safeJSON(g.players, []);

      return (
        g.status !== "finished" &&
        players.includes(user?.$id)
      );
    });

    setGames(mine);
  }

  // =========================
  // LIMIT CHECK
  // =========================
  function canPlayMore() {
    return games.filter((g) => g.status !== "finished").length < MAX_ACTIVE;
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    if (!canPlayMore()) return setMsg("Finish games first (max 5)");

    if (wallet.balance < stake) return setMsg("Insufficient balance");

    const u = await account.get();

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

    setMsg("Room created");
    loadAll();
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    if (!canPlayMore()) return setMsg("Finish a game first");

    const u = await account.get();

    const fresh = await databases.getDocument(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      room.$id
    );

    const players = safeJSON(fresh.players, []);
    const joinedUsers = safeJSON(fresh.joinedUsers, {});

    if (fresh.hostId === u.$id) {
      return setMsg("Cannot join your own room");
    }

    if (players.includes(u.$id)) {
      return setMsg("Already joined");
    }

    if (players.length >= MAX_PLAYERS) {
      return setMsg("Room full");
    }

    if (wallet.balance < fresh.stake) {
      return setMsg("Insufficient balance");
    }

    players.push(u.$id);
    joinedUsers[u.$id] = true;

    const gameStart = players.length === MAX_PLAYERS;

    await databases.updateDocument(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      fresh.$id,
      {
        players: JSON.stringify(players),
        joinedUsers: JSON.stringify(joinedUsers),
        playerCount: players.length,
        status: gameStart ? "playing" : "waiting"
      }
    );

    setMsg("Joined successfully");

    if (fresh.gameId) {
      goGame?.(fresh.gameId);
    }

    loadAll();
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <p style={{ color: "yellow" }}>{msg}</p>

      {/* CREATE */}
      <div style={styles.card}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createRoom} style={styles.createBtn}>
          Create Room
        </button>
      </div>

      {/* ACTIVE GAMES (PRIVATE) */}
      <h3>🎮 Your Active Games</h3>

      {games.map((g) => (
        <div key={g.$id} style={styles.room}>
          <p>Status: {g.status}</p>

          <button
            style={styles.resumeBtn}
            onClick={() => goGame?.(g.$id)}
          >
            ▶ Resume
          </button>
        </div>
      ))}

      {/* ROOMS */}
      <h3>Available Rooms</h3>

      {rooms.map((r) => {
        const players = safeJSON(r.players, []);
        const joined = players.includes(user?.$id);
        const hasGame = !!r.gameId;

        const showResume = joined || hasGame;

        return (
          <div key={r.$id} style={styles.room}>
            <p>Stake ₦{r.stake}</p>
            <p>Players: {players.length}/{MAX_PLAYERS}</p>

            {showResume ? (
              <button
                style={styles.resumeBtn}
                onClick={() => goGame?.(r.gameId)}
              >
                ▶ Resume
              </button>
            ) : (
              <button onClick={() => joinRoom(r)}>
                Join
              </button>
            )}
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
    padding: 10
  },
  createBtn: {
    background: "orange",
    padding: 10,
    width: "100%",
    marginTop: 10,
    fontWeight: "bold"
  },
  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 10
  },
  resumeBtn: {
    background: "#22c55e",
    padding: 10,
    border: "none",
    color: "white",
    borderRadius: 8,
    fontWeight: "bold"
  }
};