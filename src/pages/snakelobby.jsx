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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    init();
    const interval = setInterval(loadAll, 4000);
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

  // =========================
  // LOAD EVERYTHING
  // =========================
  async function loadAll() {
    await loadRooms();
    await loadActiveGames();
  }

  // =========================
  // ACTIVE GAMES (USER ONLY)
  // =========================
  async function loadActiveGames() {
    if (!user) return;

    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION,
      [Query.limit(50)]
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
  // AVAILABLE ROOMS
  // =========================
  async function loadRooms() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      [Query.limit(50)]
    );

    const filtered = res.documents.filter((r) => {
      try {
        const players = JSON.parse(r.players || "[]");

        return (
          r.status !== "finished" &&
          players.length < MAX_PLAYERS
        );
      } catch {
        return false;
      }
    });

    setRooms(filtered);
  }

  // =========================
  // LIMIT CHECK
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
    try {
      if (!canPlayMore()) {
        return setMessage("Finish current games (max 5 active)");
      }

      if (stake < 200) {
        return setMessage("Minimum stake is ₦200");
      }

      if (wallet.balance < stake) {
        return setMessage("Insufficient balance");
      }

      const u = await account.get();

      const players = [u.$id];
      const joinedUsers = { [u.$id]: true };

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - stake
        }
      );

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: u.$id,
          stake,
          status: "waiting",
          players: JSON.stringify(players),
          joinedUsers: JSON.stringify(joinedUsers),
          playerCount: 1,
          gameId: ""
        }
      );

      setMessage("Room created");
      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Failed to create room");
    }
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    try {
      if (!canPlayMore()) {
        return setMessage("Finish a game first (max 5 active)");
      }

      const u = await account.get();

      if (room.hostId === u.$id) {
        return setMessage("You cannot join your own room");
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

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - fresh.stake
        }
      );

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

      if (gameStart) {
        const total = fresh.stake * MAX_PLAYERS;
        const adminCut = total * ADMIN_CUT_PERCENT;
        const pot = total - adminCut;

        const adminRes = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", ADMIN_USER_ID)]
        );

        if (adminRes.documents.length) {
          const adminWallet = adminRes.documents[0];

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            adminWallet.$id,
            {
              balance: adminWallet.balance + adminCut
            }
          );
        }

        const game = await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: fresh.$id,
            players: JSON.stringify(players),
            positions: JSON.stringify({ A: 1, B: 1 }),
            turn: players[0],
            status: "playing",
            pot,
            winner: "",
            payoutDone: false
          }
        );

        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          fresh.$id,
          {
            gameId: game.$id,
            status: "playing"
          }
        );

        goGame(game.$id);
      }

      setMessage("Joined successfully");
      loadAll();

    } catch (err) {
      console.log(err);
      setMessage("Join failed");
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <p>{message}</p>

      <div style={styles.card}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
        />

        <button style={styles.createBtn} onClick={createRoom}>
          Create Room
        </button>
      </div>

      <h3>🔥 Your Active Games</h3>
      {activeGames.map((g) => (
        <div key={g.$id} style={styles.room}>
          <p>Status: {g.status}</p>
          {g.status !== "finished" && (
            <button onClick={() => goGame(g.$id)}>
              ▶ Resume
            </button>
          )}
        </div>
      ))}

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
  createBtn: {
    background: "orange",
    padding: 10,
    border: "none",
    width: "100%",
    marginTop: 10
  },
  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 8
  }
};