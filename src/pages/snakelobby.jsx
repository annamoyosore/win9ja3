import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query
} from "./lib/appwrite";

const LOBBY_COLLECTION = "snakelobby";
const GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

const ADMIN_USER_ID = "YOUR_ADMIN_USER_ID_HERE";

export default function SnakeLobby({ onEnterGame }) {
  const [loading, setLoading] = useState(false);
  const [stake, setStake] = useState(200);
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    loadRooms();

    // 🕒 refund checker every 1 minute
    const interval = setInterval(() => {
      checkExpiredRooms();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // 📡 Load rooms
  async function loadRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        LOBBY_COLLECTION,
        [Query.equal("status", "waiting")]
      );
      setRooms(res.documents);
    } catch (err) {
      console.log(err);
    }
  }

  // 👛 Get wallet
  async function getWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
    );
    return res.documents[0];
  }

  async function deductWallet(wallet, amount) {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: wallet.balance - amount
      }
    );
  }

  async function creditAdmin(wallet, amount) {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: wallet.balance + amount
      }
    );
  }

  // 🎮 CREATE ROOM
  async function createRoom() {
    try {
      if (stake < 200) {
        setMessage("Minimum stake is ₦200");
        return;
      }

      setLoading(true);

      const user = await account.get();
      const wallet = await getWallet(user.$id);

      if (!wallet || wallet.balance < stake) {
        setMessage("Insufficient balance");
        setLoading(false);
        return;
      }

      await deductWallet(wallet, stake);

      await databases.createDocument(
        DATABASE_ID,
        LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,

          // 🔥 IMPORTANT: store real IDs for refund system
          players: ["A"],
          joinedUsers: {
            A: user.$id
          },

          playerCount: 1,
          stake,
          status: "waiting",
          gameStarted: false,
          createdAt: new Date().toISOString()
        }
      );

      setMessage("Room created");
      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Error creating room");
    }

    setLoading(false);
  }

  // 🚪 JOIN ROOM
  async function joinRoom(room) {
    try {
      setLoading(true);

      const user = await account.get();
      const wallet = await getWallet(user.$id);

      if (!wallet || wallet.balance < room.stake) {
        setMessage("Insufficient balance");
        setLoading(false);
        return;
      }

      let players = room.players || [];
      let joinedUsers = room.joinedUsers || {};

      if (players.length >= 3) {
        setMessage("Room full");
        setLoading(false);
        return;
      }

      let nextPlayer = "B";
      if (players.length === 2) nextPlayer = "C";

      await deductWallet(wallet, room.stake);

      players.push(nextPlayer);
      joinedUsers[nextPlayer] = user.$id;

      const playerCount = players.length;
      const gameStarted = playerCount === 3;

      await databases.updateDocument(
        DATABASE_ID,
        LOBBY_COLLECTION,
        room.$id,
        {
          players,
          joinedUsers,
          playerCount,
          status: gameStarted ? "playing" : "waiting",
          gameStarted
        }
      );

      // 🎯 WHEN ROOM FILLS
      if (gameStarted) {
        const totalPot = room.stake * 3;
        const adminCut = totalPot * 0.15;
        const gamePot = totalPot - adminCut;

        // 🧑‍💼 ADMIN PAYOUT
        const adminRes = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", ADMIN_USER_ID)]
        );

        const adminWallet = adminRes.documents[0];

        if (adminWallet) {
          await creditAdmin(adminWallet, adminCut);
        }

        // 🎮 CREATE GAME
        const snakeGame = await databases.createDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: room.$id,
            players,

            positions: JSON.stringify({ A: 1, B: 1, C: 1 }),
            ranking: [],
            history: JSON.stringify([]),

            winner: "",
            turn: "A",
            status: "playing",

            pot: gamePot,

            payoutDone: false,
            payouts: JSON.stringify({})
          }
        );

        await databases.updateDocument(
          DATABASE_ID,
          LOBBY_COLLECTION,
          room.$id,
          {
            gameId: snakeGame.$id
          }
        );

        if (onEnterGame) {
          onEnterGame(snakeGame.$id);
        }
      }

      setMessage("Joined room");
      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Error joining room");
    }

    setLoading(false);
  }

  // 🕒 REFUND SYSTEM (78 HOURS)
  async function checkExpiredRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        LOBBY_COLLECTION,
        [Query.equal("status", "waiting")]
      );

      const now = Date.now();

      for (const room of res.documents) {
        const created = new Date(room.createdAt).getTime();
        const hours = (now - created) / (1000 * 60 * 60);

        if (hours >= 78) {
          await refundRoom(room);
        }
      }
    } catch (err) {
      console.log(err);
    }
  }

  // 💸 REFUND LOGIC
  async function refundRoom(room) {
    try {
      const stake = room.stake;

      const users = room.joinedUsers || {};

      for (const key in users) {
        const userId = users[key];

        const wallet = await getWallet(userId);

        if (wallet) {
          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            wallet.$id,
            {
              balance: wallet.balance + stake
            }
          );
        }
      }

      await databases.updateDocument(
        DATABASE_ID,
        LOBBY_COLLECTION,
        room.$id,
        {
          status: "expired"
        }
      );

      console.log("Refunded room:", room.$id);

    } catch (err) {
      console.log("Refund error:", err);
    }
  }

  return (
    <div style={styles.container}>
      <h1>🐍 Snake Lobby</h1>

      <div style={styles.card}>
        <h3>Stake</h3>

        <input
          type="number"
          min="200"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createRoom} disabled={loading}>
          Create Room
        </button>

        <p>Min ₦200</p>
      </div>

      {message && <p>{message}</p>}

      <div>
        <h3>Rooms</h3>

        {rooms.map((r) => (
          <div key={r.$id} style={styles.room}>
            <p>Stake: ₦{r.stake}</p>
            <p>Players: {r.playerCount}/3</p>

            <button onClick={() => joinRoom(r)} disabled={loading}>
              Join
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

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
    maxWidth: 300
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
  }
};