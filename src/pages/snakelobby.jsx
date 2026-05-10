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

  useEffect(() => {
    loadRooms();
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  // 📡 LOAD ROOMS
  async function loadRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.equal("status", "waiting")]
      );
      setRooms(res.documents);
    } catch (err) {
      console.log("LOAD ERROR:", err);
    }
  }

  // 👛 WALLET HELPERS
  async function getWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
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

  // 🎮 CREATE ROOM (HOST)
  async function createRoom() {
    try {
      setLoading(true);
      setMessage("");

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
          players: JSON.stringify([user.$id]),
          joinedUsers: JSON.stringify({ A: user.$id }),
          playerCount: 1,
          stake,
          status: "waiting",
          createdAt: new Date().toISOString()
        }
      );

      setMessage("Room created. Waiting for players...");
      loadRooms();

    } catch (err) {
      console.log("CREATE ERROR:", err);
      setMessage(err.message || "Failed to create room");
    }

    setLoading(false);
  }

  // 🚪 JOIN ROOM
  async function joinRoom(room) {
    try {
      setLoading(true);
      setMessage("");

      const user = await account.get();
      const wallet = await getWallet(user.$id);

      if (!wallet || wallet.balance < room.stake) {
        setMessage("Insufficient balance");
        return;
      }

      let players = JSON.parse(room.players || "[]");
      let joinedUsers = JSON.parse(room.joinedUsers || "{}");

      if (players.includes(user.$id)) {
        setMessage("Already joined");
        return;
      }

      if (players.length >= MAX_PLAYERS) {
        setMessage("Room full");
        return;
      }

      await deductWallet(wallet, room.stake);

      players.push(user.$id);
      joinedUsers[`P${players.length}`] = user.$id;

      const isFull = players.length === MAX_PLAYERS;

      // 💰 CALCULATE POT ONLY WHEN FULL
      if (isFull) {
        const totalPot = room.stake * MAX_PLAYERS;
        const adminCut = totalPot * ADMIN_PERCENT;
        const gamePot = totalPot - adminCut;

        // 👑 CREDIT ADMIN
        const adminWallet = await getWallet(ADMIN_USER_ID);
        if (adminWallet) {
          await updateWallet(adminWallet, adminCut);
        }

        // 🎮 CREATE GAME
        const game = await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: room.$id,
            players: JSON.stringify(players),
            positions: JSON.stringify({}),
            turn: players[0],
            status: "playing",
            pot: gamePot,
            winner: "",
            payoutDone: false
          }
        );

        // 🏁 UPDATE LOBBY
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          room.$id,
          {
            players: JSON.stringify(players),
            joinedUsers: JSON.stringify(joinedUsers),
            playerCount: players.length,
            status: "finished",
            gameId: game.$id
          }
        );

        setMessage("Game started 🎮");
        onEnterGame?.(game.$id);

      } else {
        // ⏳ STILL WAITING
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          room.$id,
          {
            players: JSON.stringify(players),
            joinedUsers: JSON.stringify(joinedUsers),
            playerCount: players.length
          }
        );

        setMessage("Joined room. Waiting for opponent...");
      }

      loadRooms();

    } catch (err) {
      console.log("JOIN ERROR:", err);
      setMessage(err.message || "Failed to join room");
    }

    setLoading(false);
  }

  // ========================= UI =========================
  return (
    <div style={styles.container}>
      <h1>🐍 Snake Lobby</h1>

      <div style={styles.card}>
        <h3>Stake</h3>

        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createRoom} style={styles.createBtn} disabled={loading}>
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
            style={styles.joinBtn}
            disabled={loading || r.status === "finished"}
          >
            Join
          </button>
        </div>
      ))}
    </div>
  );
}

// ========================= STYLES =========================
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
  createBtn: {
    width: "100%",
    padding: 12,
    background: "orange",
    border: "none",
    borderRadius: 8,
    color: "black",
    fontWeight: "bold"
  },
  joinBtn: {
    padding: 10,
    background: "#22c55e",
    border: "none",
    borderRadius: 8,
    color: "white"
  },
  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 8
  }
};