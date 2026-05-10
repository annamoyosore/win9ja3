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

// 💰 ADMIN CUT
const ADMIN_PERCENT = 0.15;

export default function SnakeLobby({ onEnterGame }) {
  const [loading, setLoading] = useState(false);
  const [stake, setStake] = useState(200);
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState([]);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    init();
    loadRooms();

    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  async function init() {
    try {
      const user = await account.get();
      setUserId(user.$id);
    } catch (e) {
      console.log(e);
    }
  }

  // 📡 LOAD ONLY ACTIVE ROOMS
  async function loadRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [
          Query.equal("status", "waiting")
        ]
      );
      setRooms(res.documents);
    } catch (err) {
      console.log(err);
    }
  }

  // 👛 WALLET
  async function getWallet(uid) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", uid)]
    );
    return res.documents[0];
  }

  async function updateWallet(wallet, amount) {
    return databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: wallet.balance + amount }
    );
  }

  async function deductWallet(wallet, amount) {
    return databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: wallet.balance - amount }
    );
  }

  // 🎮 CREATE ROOM
  async function createRoom() {
    try {
      setLoading(true);
      setMessage("");

      if (stake < 200) {
        setMessage("Minimum stake is ₦200");
        return;
      }

      const user = await account.get();
      const wallet = await getWallet(user.$id);

      if (!wallet || wallet.balance < stake) {
        setMessage("Insufficient balance");
        return;
      }

      await deductWallet(wallet, stake);

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          players: [user.$id],
          playerCount: 1,
          joinedUsers: { A: user.$id },
          stake,
          status: "waiting",
          createdAt: new Date().toISOString()
        }
      );

      setMessage("Room created successfully ✅");
      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Failed to create room");
    }

    setLoading(false);
  }

  // 🚪 JOIN ROOM
  async function joinRoom(room) {
    try {
      setLoading(true);
      setMessage("");

      // ❌ BLOCK FINISHED GAME
      if (room.status !== "waiting") {
        setMessage("This room is already finished");
        return;
      }

      const user = await account.get();
      const wallet = await getWallet(user.$id);

      if (!wallet || wallet.balance < room.stake) {
        setMessage("Insufficient balance");
        return;
      }

      let players = room.players || [];
      let joinedUsers = room.joinedUsers || {};

      if (players.includes(user.$id)) {
        setMessage("You already joined this room");
        return;
      }

      if (players.length >= MAX_PLAYERS) {
        setMessage("Room is full");
        return;
      }

      await deductWallet(wallet, room.stake);

      players.push(user.$id);
      joinedUsers[`P${players.length}`] = user.$id;

      const gameReady = players.length === MAX_PLAYERS;

      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          players,
          joinedUsers,
          playerCount: players.length,
          status: gameReady ? "playing" : "waiting"
        }
      );

      // 🎯 START GAME
      if (gameReady) {
        const totalPot = room.stake * MAX_PLAYERS;
        const adminCut = totalPot * ADMIN_PERCENT;
        const gamePot = totalPot - adminCut;

        const adminWallet = await getWallet(ADMIN_USER_ID);

        if (adminWallet) {
          await updateWallet(adminWallet, adminCut);
        }

        const game = await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: room.$id,
            players,
            positions: JSON.stringify({}),
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
            gameId: game.$id
          }
        );

        setMessage("Game started 🎮");
        onEnterGame?.(game.$id);
      } else {
        setMessage("Joined room ⏳ waiting for opponent");
      }

      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Error joining room");
    }

    setLoading(false);
  }

  return (
    <div style={styles.container}>
      <h1>🐍 Snake Lobby</h1>

      {/* CREATE ROOM */}
      <div style={styles.card}>
        <h3>Stake Amount</h3>

        <input
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
          type="number"
          min="200"
        />

        <button
          onClick={createRoom}
          disabled={loading}
          style={styles.createBtn}
        >
          🎮 Create Room
        </button>

        <p style={{ color: "orange" }}>{message}</p>
      </div>

      {/* ROOMS */}
      <h3>Available Rooms</h3>

      {rooms.length === 0 && <p>No active rooms</p>}

      {rooms.map((r) => (
        <div key={r.$id} style={styles.room}>
          <p>💰 Stake: ₦{r.stake}</p>
          <p>👥 Players: {r.playerCount}/{MAX_PLAYERS}</p>

          <button
            onClick={() => joinRoom(r)}
            disabled={loading || r.status !== "waiting"}
            style={styles.joinBtn}
          >
            Join Room
          </button>
        </div>
      ))}
    </div>
  );
}

// =========================
// STYLES
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
    borderRadius: 10,
    marginBottom: 20
  },

  input: {
    width: "100%",
    padding: 10,
    marginBottom: 10
  },

  createBtn: {
    width: "100%",
    padding: 12,
    background: "orange",
    color: "black",
    fontWeight: "bold",
    border: "none",
    borderRadius: 8
  },

  joinBtn: {
    padding: 10,
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: 8
  },

  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 8
  }
};