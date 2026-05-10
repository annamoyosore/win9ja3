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
const ADMIN_CUT_PERCENT = 0.1;

export default function SnakeLobby({ goGame, back }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState(200);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    init();
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    await loadRooms();
  }

  // =========================
  // LOAD ROOMS (ONLY WAITING)
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
      console.log(err);
    }
  }

  // =========================
  // WALLET HELPERS
  // =========================
  async function updateWallet(amount) {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: Number(wallet.balance) + amount
      }
    );
  }

  async function deductWallet(amount) {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: Number(wallet.balance) - amount
      }
    );
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    try {
      setLoading(true);
      setMessage("");

      if (!stake || stake < 200) {
        setMessage("Minimum stake is ₦200");
        setLoading(false);
        return;
      }

      const balance = Number(wallet?.balance || 0);
      if (balance < stake) {
        setMessage("Insufficient balance");
        setLoading(false);
        return;
      }

      const u = await account.get();

      await deductWallet(stake);

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: u.$id,
          stake,
          status: "waiting",
          players: JSON.stringify([u.$id]),
          joinedUsers: JSON.stringify({ [u.$id]: true }),
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

      const u = await account.get();

      // 🚫 prevent self join
      if (room.hostId === u.$id) {
        setMessage("You cannot join your own room");
        setLoading(false);
        return;
      }

      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id
      );

      if (fresh.status !== "waiting") {
        setMessage("Room already started");
        setLoading(false);
        return;
      }

      const balance = Number(wallet?.balance || 0);
      if (balance < fresh.stake) {
        setMessage("Insufficient balance");
        setLoading(false);
        return;
      }

      let players = JSON.parse(fresh.players || "[]");
      let joinedUsers = JSON.parse(fresh.joinedUsers || "{}");

      if (players.length >= MAX_PLAYERS) {
        setMessage("Room full");
        setLoading(false);
        return;
      }

      if (joinedUsers[u.$id]) {
        setMessage("Already joined");
        setLoading(false);
        return;
      }

      // 💰 deduct ONLY AFTER validation
      await deductWallet(fresh.stake);

      players.push(u.$id);
      joinedUsers[u.$id] = true;

      const gameStart = players.length === MAX_PLAYERS;

      // =========================
      // UPDATE LOBBY FIRST
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          players: JSON.stringify(players),
          joinedUsers: JSON.stringify(joinedUsers),
          playerCount: players.length,
          status: gameStart ? "matched" : "waiting"
        }
      );

      // =========================
      // START GAME
      // =========================
      if (gameStart) {
        const totalPot = fresh.stake * MAX_PLAYERS;
        const adminCut = totalPot * ADMIN_CUT_PERCENT;
        const gamePot = totalPot - adminCut;

        const admin = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", ADMIN_USER_ID), Query.limit(1)]
        );

        if (admin.documents.length) {
          const adminWallet = admin.documents[0];

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            adminWallet.$id,
            {
              balance: Number(adminWallet.balance) + adminCut
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
          fresh.$id,
          {
            gameId: game.$id,
            status: "finished"
          }
        );

        goGame(game.$id);
      }

      setMessage("Joined successfully");
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
              Join
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