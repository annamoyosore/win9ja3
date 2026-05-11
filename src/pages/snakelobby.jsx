import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query,
} from "../lib/appwrite";

// =========================
// COLLECTIONS
// =========================
const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegames";
const WALLET_COLLECTION = "wallets";

// ✅ ADMIN
const ADMIN_USER_ID = "69ef9fe863a02a7490b4";

// =========================
// CONFIG
// =========================
const MIN_STAKE = 150;

// =========================
// COMPONENT
// =========================
export default function SnakeLobby({ openGame, goHome }) {
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [stake, setStake] = useState(MIN_STAKE);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const lock = useRef(false);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(setUser);
  }, []);

  // =========================
  // LOAD ROOMS
  // =========================
  useEffect(() => {
    if (!user) return;

    loadRooms();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${SNAKE_LOBBY_COLLECTION}.documents`,
      () => loadRooms()
    );

    return () => unsub();
  }, [user]);

  async function loadRooms() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.notEqual("status", "finished")]
      );

      setRooms(res.documents);
    } catch (err) {
      console.log(err);
    }
  }

  // =========================
  // WALLET
  // =========================
  async function getWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", userId),
        Query.limit(1),
      ]
    );

    return res.documents[0] || null;
  }

  function popup(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 2500);
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    if (lock.current) return;
    lock.current = true;

    try {
      setLoading(true);

      if (stake < MIN_STAKE) {
        return popup("❌ Minimum stake is ₦150");
      }

      const wallet = await getWallet(user.$id);

      if (!wallet) return popup("Wallet not found");

      const balance = Number(wallet.balance || 0);

      if (balance < stake) {
        return popup("❌ Insufficient funds");
      }

      // 💸 DEDUCT STAKE
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: balance - stake,
        }
      );

      // 🎮 CREATE LOBBY
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          hostName: "Player A",
          opponentId: "",
          opponentName: "",
          stake,
          pot: stake,
          adminCut: 0,
          status: "waiting",
          gameId: "",
          payoutDone: false,
        }
      );

      popup("✅ Room created");
      loadRooms();
    } catch (err) {
      console.log(err);
      popup("❌ Failed to create room");
    } finally {
      setLoading(false);
      lock.current = false;
    }
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    if (lock.current) return;
    lock.current = true;

    try {
      setLoading(true);

      if (room.hostId === user.$id) return;

      if (room.opponentId) return popup("Room already full");

      const wallet = await getWallet(user.$id);

      if (!wallet) return popup("Wallet not found");

      const balance = Number(wallet.balance || 0);
      const stakeValue = Number(room.stake || 0);

      if (stakeValue < MIN_STAKE) {
        return popup("Invalid stake");
      }

      if (balance < stakeValue) {
        return popup("❌ Insufficient funds");
      }

      // 💸 DEDUCT PLAYER B
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: balance - stakeValue,
        }
      );

      const totalPot = stakeValue * 2;
      const adminCut = Math.floor(totalPot * 0.1);
      const gamePot = totalPot - adminCut;

      // 💰 CREDIT ADMIN
      const adminWallet = await getWallet(ADMIN_USER_ID);

      if (adminWallet) {
        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.$id,
          {
            balance:
              Number(adminWallet.balance || 0) + adminCut,
          }
        );
      }

      // 🎮 CREATE GAME
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          lobbyId: room.$id,
          hostId: room.hostId,
          opponentId: user.$id,
          turn: room.hostId,
          positions: JSON.stringify({ A: 1, B: 1 }),
          history: JSON.stringify([]),
          dice: 1,
          winner: "",
          winnerId: "",
          status: "playing",
          payoutDone: false,
          pot: gamePot,
        }
      );

      // 🏁 UPDATE LOBBY
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          opponentId: user.$id,
          opponentName: "Player B",
          adminCut,
          pot: gamePot,
          gameId: game.$id,
          status: "playing",
        }
      );

      popup("🎮 Game started");

      openGame(game.$id, room.$id);
    } catch (err) {
      console.log(err);
      popup("❌ Failed to join room");
    } finally {
      setLoading(false);
      lock.current = false;
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      {message && <div style={styles.popup}>{message}</div>}

      {/* CREATE */}
      <div style={styles.card}>
        <input
          type="number"
          value={stake}
          min={MIN_STAKE}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createRoom} disabled={loading}>
          Create Room
        </button>
      </div>

      {/* ROOMS */}
      <div>
        {rooms.map((room) => (
          <div key={room.$id} style={styles.room}>
            <div>Stake: ₦{room.stake}</div>
            <div>Pot: ₦{room.pot}</div>

            {room.status === "waiting" &&
              room.hostId !== user?.$id && (
                <button onClick={() => joinRoom(room)}>
                  Join
                </button>
              )}
          </div>
        ))}
      </div>

      <button onClick={goHome}>Exit</button>
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
    color: "#fff",
    minHeight: "100vh",
    textAlign: "center",
  },

  card: {
    marginBottom: 20,
  },

  input: {
    padding: 10,
    width: 120,
    marginRight: 10,
  },

  room: {
    background: "#111827",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
  },

  popup: {
    background: "#dc2626",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
  },
};