import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query
} from "./lib/appwrite";

const LOBBY_COLLECTION = "snakelobby";

export default function SnakeLobby({ onEnterGame }) {
  const [loading, setLoading] = useState(false);

  const [stake, setStake] = useState(200);

  const [message, setMessage] = useState("");

  const [rooms, setRooms] = useState([]);

  // 📡 LOAD OPEN ROOMS
  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        LOBBY_COLLECTION,
        [
          Query.equal("status", "waiting")
        ]
      );

      setRooms(res.documents);
    } catch (err) {
      console.log(err);
    }
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

      const totalPot = stake * 3;

      const adminCut = totalPot * 0.15;

      const reservedPot = totalPot - adminCut;

      const room = await databases.createDocument(
        DATABASE_ID,
        LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,

          players: ["A"],

          playerCount: 1,

          stake,

          totalPot,

          adminCut,

          reservedPot,

          status: "waiting",

          gameStarted: false,
        }
      );

      setMessage("Room created successfully");

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

      let players = room.players || [];

      if (players.length >= 3) {
        setMessage("Room full");
        return;
      }

      let nextPlayer = "B";

      if (players.length === 2) {
        nextPlayer = "C";
      }

      players = [...players, nextPlayer];

      const playerCount = players.length;

      const gameStarted = playerCount === 3;

      await databases.updateDocument(
        DATABASE_ID,
        LOBBY_COLLECTION,
        room.$id,
        {
          players,
          playerCount,
          gameStarted,
          status: gameStarted ? "playing" : "waiting",
        }
      );

      // 🎮 START GAME WHEN 3 PLAYERS JOIN
      if (gameStarted) {
        const snakeGame = await databases.createDocument(
          DATABASE_ID,
          "snakegame",
          ID.unique(),
          {
            lobbyId: room.$id,

            players,

            positions: {
              A: 1,
              B: 1,
              C: 1,
            },

            ranking: [],

            history: [],

            winner: "",

            turn: "A",

            status: "playing",

            pot: room.reservedPot,

            payoutDone: false,

            payouts: {},
          }
        );

        // 🔗 LINK GAME TO LOBBY
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

      setMessage("Joined room successfully");

      loadRooms();

    } catch (err) {
      console.log(err);
      setMessage("Failed to join room");
    }

    setLoading(false);
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>
        🐍 Snake Lobby
      </h1>

      {/* CREATE ROOM */}
      <div style={styles.card}>
        <h3>Create Room</h3>

        <input
          type="number"
          min="200"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
          placeholder="Enter stake amount"
        />

        <button
          onClick={createRoom}
          disabled={loading}
          style={styles.button}
        >
          Create Lobby
        </button>

        <div style={styles.note}>
          Minimum Stake: ₦200
        </div>
      </div>

      {/* MESSAGE */}
      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

      {/* AVAILABLE ROOMS */}
      <div style={styles.rooms}>
        <h3>Available Rooms</h3>

        {rooms.length === 0 && (
          <div>No open rooms</div>
        )}

        {rooms.map((room) => (
          <div key={room.$id} style={styles.roomCard}>
            <div>
              Stake: ₦{room.stake}
            </div>

            <div>
              Players: {room.playerCount}/3
            </div>

            <div>
              Pot: ₦{room.reservedPot}
            </div>

            <button
              onClick={() => joinRoom(room)}
              disabled={loading}
              style={styles.joinBtn}
            >
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
    minHeight: "100vh",
    background: "#0f172a",
    color: "white",
    padding: 20,
    fontFamily: "Arial",
  },

  title: {
    textAlign: "center",
    marginBottom: 20,
  },

  card: {
    background: "#1e293b",
    padding: 20,
    borderRadius: 12,
    maxWidth: 350,
    margin: "0 auto",
    textAlign: "center",
  },

  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    marginTop: 10,
    marginBottom: 15,
    fontSize: 16,
  },

  button: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    cursor: "pointer",
  },

  note: {
    marginTop: 10,
    fontSize: 13,
    opacity: 0.8,
  },

  message: {
    marginTop: 15,
    textAlign: "center",
    color: "#facc15",
    fontWeight: "bold",
  },

  rooms: {
    marginTop: 30,
    maxWidth: 400,
    marginInline: "auto",
  },

  roomCard: {
    background: "#111827",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    lineHeight: 1.8,
  },

  joinBtn: {
    width: "100%",
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    border: "none",
    background: "#3b82f6",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
};