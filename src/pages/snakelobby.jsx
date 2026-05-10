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
const ADMIN_CUT = 0.15;

export default function SnakeLobby({ onEnterGame }) {
  const [stake, setStake] = useState(200);
  const [rooms, setRooms] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRooms();
    const t = setInterval(loadRooms, 5000);
    return () => clearInterval(t);
  }, []);

  // =========================
  // LOAD ONLY ACTIVE ROOMS
  // =========================
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
      console.log("loadRooms error", err);
    }
  }

  // =========================
  // WALLET HELPERS
  // =========================
  async function getWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
    );
    return res.documents[0];
  }

  async function updateWallet(wallet, amount) {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: wallet.balance + amount }
    );
  }

  async function deductWallet(wallet, amount) {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: wallet.balance - amount }
    );
  }

  // =========================
  // CREATE ROOM (HOST)
  // =========================
  async function createRoom() {
    try {
      setLoading(true);
      setMessage("");

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
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          stake,
          status: "waiting",
          players: JSON.stringify(["A"]),
          joinedUsers: JSON.stringify({ A: user.$id }),
          playerCount: 1,
          gameId: ""
        }
      );

      setMessage("Room created. Waiting for opponent...");
      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Failed to create room");
    }

    setLoading(false);
  }

  // =========================
  // JOIN ROOM
  // =========================
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

      let players = JSON.parse(room.players || "[]");
      let joinedUsers = JSON.parse(room.joinedUsers || "{}");

      if (players.length >= MAX_PLAYERS) {
        setMessage("Room full");
        setLoading(false);
        return;
      }

      if (joinedUsers[user.$id]) {
        setMessage("Already joined");
        setLoading(false);
        return;
      }

      await deductWallet(wallet, room.stake);

      const next = "B";

      players.push(next);
      joinedUsers[user.$id] = user.$id;

      const gameReady = players.length === MAX_PLAYERS;

      // =========================
      // UPDATE LOBBY FIRST
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          players: JSON.stringify(players),
          joinedUsers: JSON.stringify(joinedUsers),
          playerCount: players.length,
          status: gameReady ? "finished" : "waiting"
        }
      );

      // =========================
      // START GAME WHEN FULL
      // =========================
      if (gameReady) {
        const totalPot = room.stake * MAX_PLAYERS;
        const adminCut = totalPot * ADMIN_CUT;
        const gamePot = totalPot - adminCut;

        const adminRes = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", ADMIN_USER_ID)]
        );

        if (adminRes.documents[0]) {
          await updateWallet(adminRes.documents[0], adminCut);
        }

        const game = await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: room.$id,
            players: JSON.stringify(players),
            positions: JSON.stringify({ A: 1, B: 1 }),
            turn: "A",
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

        setMessage("Game started!");

        if (onEnterGame) {
          onEnterGame(game.$id);
        }
      } else {
        setMessage("Joined room. Waiting for opponent...");
      }

      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Join failed");
    }

    setLoading(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <div style={styles.card}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button
          onClick={createRoom}
          disabled={loading}
          style={styles.createBtn}
        >
          Create Room
        </button>

        <p>{message}</p>
      </div>

      <h3>Available Rooms</h3>

      {rooms.map((r) => {
        const players = JSON.parse(r.players || "[]");

        return (
          <div key={r.$id} style={styles.room}>
            <p>Stake: ₦{r.stake}</p>
            <p>Players: {players.length}/{MAX_PLAYERS}</p>

            <button onClick={() => joinRoom(r)}>
              Join / Resume
            </button>
          </div>
        );
      })}
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
    borderRadius: 8,
    width: "100%",
    fontWeight: "bold"
  },
  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 8
  }
};