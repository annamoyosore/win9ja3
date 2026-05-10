import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query
} from "../lib/appwrite";

// 🐍 COLLECTIONS
const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

const ADMIN_USER_ID = "69ef9fe863a02a7490b4";
const MAX_PLAYERS = 2;
const ADMIN_PERCENT = 0.15;

export default function SnakeLobby({ onEnterGame }) {
  const [loading, setLoading] = useState(false);
  const [stake, setStake] = useState(200);
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState([]);
  const [activeGame, setActiveGame] = useState(null);

  useEffect(() => {
    init();

    const interval = setInterval(() => {
      loadRooms();
      checkActiveGame();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // =========================
  // INIT
  // =========================
  async function init() {
    await loadRooms();
    await checkActiveGame();
  }

  // =========================
  // ONLY USER ACTIVE GAME
  // =========================
  async function checkActiveGame() {
    try {
      const user = await account.get();

      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        [
          Query.equal("status", "playing"),
          Query.contains("players", user.$id)
        ]
      );

      if (res.documents.length > 0) {
        setActiveGame(res.documents[0]);
      } else {
        setActiveGame(null);
      }
    } catch (err) {
      console.log("ACTIVE GAME ERROR:", err);
    }
  }

  // =========================
  // PUBLIC LOBBY ONLY (WAITING)
  // =========================
  async function loadRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.equal("status", "waiting")]
      );

      setRooms(res.documents);
    } catch (err) {
      console.log("LOAD ROOMS ERROR:", err);
    }
  }

  // =========================
  // WALLET
  // =========================
  async function getWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
    );
    return res.documents[0];
  }

  async function deduct(wallet, amount) {
    return databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: wallet.balance - amount }
    );
  }

  async function credit(wallet, amount) {
    return databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: wallet.balance + amount }
    );
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    try {
      setLoading(true);
      setMessage("");

      const user = await account.get();
      const wallet = await getWallet(user.$id);

      if (!wallet || wallet.balance < stake) {
        setMessage("❌ Insufficient balance");
        return;
      }

      await deduct(wallet, stake);

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          players: [user.$id],
          joinedUsers: { A: user.$id },
          playerCount: 1,
          stake,
          status: "waiting"
        }
      );

      setMessage("✅ Room created. Waiting for opponent...");
      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("❌ Failed to create room");
    }

    setLoading(false);
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    try {
      setLoading(true);
      setMessage("");

      const user = await account.get();
      const wallet = await getWallet(user.$id);

      if (!wallet || wallet.balance < room.stake) {
        setMessage("❌ Insufficient balance");
        return;
      }

      let players = room.players || [];

      if (players.includes(user.$id)) {
        setMessage("⚠️ Already joined");
        return;
      }

      if (players.length >= MAX_PLAYERS) {
        setMessage("❌ Room full");
        return;
      }

      await deduct(wallet, room.stake);

      players.push(user.$id);

      const isFull = players.length === MAX_PLAYERS;

      if (isFull) {
        const totalPot = room.stake * MAX_PLAYERS;
        const adminCut = totalPot * ADMIN_PERCENT;
        const gamePot = totalPot - adminCut;

        const adminWallet = await getWallet(ADMIN_USER_ID);
        if (adminWallet) {
          await credit(adminWallet, adminCut);
        }

        const game = await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: room.$id,
            players,
            positions: { A: 1, B: 1 },
            turn: players[0],
            status: "playing",
            pot: gamePot,
            winner: "",
            payoutDone: false
          }
        );

        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          room.$id,
          {
            players,
            playerCount: players.length,
            status: "finished",
            gameId: game.$id
          }
        );

        setActiveGame(game);
        onEnterGame?.(game.$id);

      } else {
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          room.$id,
          {
            players,
            playerCount: players.length
          }
        );

        setMessage("⏳ Waiting for opponent...");
      }

      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("❌ Failed to join room");
    }

    setLoading(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>🐍 Snake Lobby</h1>

      {/* RESUME GAME */}
      {activeGame && (
        <button
          style={styles.resume}
          onClick={() => onEnterGame(activeGame.$id)}
        >
          🔁 Resume Your Game
        </button>
      )}

      <div style={styles.card}>
        <h3>Create Room</h3>

        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createRoom} disabled={loading}>
          🎮 Create Room
        </button>

        <p>{message}</p>
      </div>

      <h3>Available Rooms</h3>

      {rooms.map((r) => (
        <div key={r.$id} style={styles.room}>
          <p>💰 ₦{r.stake}</p>
          <p>👥 {r.playerCount}/{MAX_PLAYERS}</p>

          <button
            onClick={() => joinRoom(r)}
            disabled={loading || r.status !== "waiting"}
          >
            Join
          </button>
        </div>
      ))}
    </div>
  );
}

// =========================
const styles = {
  container: {
    background: "#0f172a",
    color: "white",
    minHeight: "100vh",
    padding: 20
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
  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 8
  },
  resume: {
    background: "orange",
    padding: 12,
    border: "none",
    borderRadius: 8,
    marginBottom: 10,
    fontWeight: "bold"
  }
};