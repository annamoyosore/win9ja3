import { useEffect, useState } from "react";
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

// ✅ ADMIN USER ID
const ADMIN_USER_ID = "69ef9fe863a02a7490b4";

// ✅ MINIMUM STAKE
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

  const lock = useState(false)[0];

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(setUser).catch(() => {});
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

      setRooms(res.documents || []);
    } catch (err) {
      console.log("LOAD ROOMS ERROR:", err);
    }
  }

  // =========================
  // WALLET
  // =========================
  async function getWallet(uid) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", uid), Query.limit(1)]
    );

    return res.documents?.[0] || null;
  }

  function popup(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 2500);
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    if (!user) return;

    try {
      setLoading(true);

      if (stake < MIN_STAKE) {
        return popup("❌ Minimum stake is ₦150");
      }

      const wallet = await getWallet(user.$id);

      if (!wallet) return popup("Wallet not found");

      const balance = Number(wallet.balance || 0);

      if (balance < stake) {
        return popup("❌ Insufficient balance");
      }

      // 💸 deduct host stake
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: balance - stake }
      );

      // 🎮 create lobby (ONLY valid fields)
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: "",
          stake,
          pot: stake,
          adminCut: 0,
          status: "waiting",
          gameId: "",
          payoutDone: false,
          winnerId: "",
        }
      );

      popup("✅ Room created");
      loadRooms();
    } catch (err) {
      console.log("CREATE ERROR:", err);
      popup("❌ Failed to create room");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    if (!user || lock) return;
    lock = true;

    try {
      setLoading(true);

      if (room.hostId === user.$id) {
        return popup("❌ You cannot join your own room");
      }

      if (room.opponentId) {
        return popup("Room already full");
      }

      const wallet = await getWallet(user.$id);

      if (!wallet) return popup("Wallet not found");

      const balance = Number(wallet.balance || 0);
      const stakeValue = Number(room.stake || 0);

      if (stakeValue < MIN_STAKE) {
        return popup("❌ Minimum stake is ₦150");
      }

      if (balance < stakeValue) {
        return popup("❌ Insufficient funds");
      }

      // 💸 deduct opponent stake
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: balance - stakeValue }
      );

      // 💰 pot calculation
      const totalPot = stakeValue * 2;
      const adminCut = Math.floor(totalPot * 0.1);
      const gamePot = totalPot - adminCut;

      // 💰 admin payout
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

      // 🎮 create game
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

      // 🏁 update lobby
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          opponentId: user.$id,
          status: "playing",
          gameId: game.$id,
          pot: gamePot,
        }
      );

      popup("🎮 Joined successfully");
      openGame(game.$id, room.$id);

    } catch (err) {
      console.log("JOIN ERROR:", err);
      popup("❌ Failed to join room");
    } finally {
      setLoading(false);
      lock = false;
    }
  }

  // =========================
  // RESUME GAME
  // =========================
  function resumeGame(room) {
    if (!room?.gameId) return;
    openGame(room.gameId, room.$id);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      {message && <div style={styles.message}>{message}</div>}

      {/* CREATE ROOM */}
      <div style={styles.create}>
        <input
          type="number"
          value={stake}
          min={MIN_STAKE}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button
          onClick={createRoom}
          disabled={loading}
          style={styles.button}
        >
          Create Room
        </button>
      </div>

      {/* ROOMS */}
      <div style={styles.rooms}>
        {rooms.map((room) => {
          const isHost = room.hostId === user?.$id;

          return (
            <div key={room.$id} style={styles.room}>
              <div>🎮 Stake: ₦{room.stake}</div>
              <div>🏦 Pot: ₦{room.pot}</div>
              <div>Status: {room.status}</div>

              {room.status === "waiting" && !isHost && (
                <button
                  onClick={() => joinRoom(room)}
                  style={styles.joinBtn}
                >
                  Join
                </button>
              )}

              {isHost && room.status === "waiting" && (
                <div style={{ color: "gold" }}>
                  Waiting for opponent...
                </div>
              )}

              {(isHost || room.opponentId === user?.$id) &&
                room.status === "playing" && (
                  <button
                    onClick={() => resumeGame(room)}
                    style={styles.resumeBtn}
                  >
                    Resume Game
                  </button>
                )}
            </div>
          );
        })}
      </div>

      <button onClick={goHome} style={styles.exitBtn}>
        Exit
      </button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    minHeight: "100vh",
    background: "#0f172a",
    color: "#fff",
    padding: 20,
    textAlign: "center",
  },
  message: {
    background: "#dc2626",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  create: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  input: {
    padding: 10,
    borderRadius: 8,
    border: "none",
    width: 120,
  },
  button: {
    padding: "10px 15px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    color: "#fff",
    fontWeight: "bold",
  },
  rooms: {
    maxWidth: 420,
    margin: "0 auto",
  },
  room: {
    background: "#111827",
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
  },
  joinBtn: {
    marginTop: 10,
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: 10,
    borderRadius: 8,
  },
  resumeBtn: {
    marginTop: 10,
    background: "gold",
    color: "#000",
    border: "none",
    padding: 10,
    borderRadius: 8,
  },
  exitBtn: {
    marginTop: 20,
    background: "#ef4444",
    color: "#fff",
    border: "none",
    padding: 12,
    borderRadius: 8,
  },
};