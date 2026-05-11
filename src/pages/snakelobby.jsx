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

const ADMIN_USER_ID = "69ef9fe863a02a7490b4";
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

  // =========================
  // INIT USER
  // =========================
  useEffect(() => {
    account.get().then(setUser).catch(() => {});
  }, []);

  // =========================
  // LOAD ROOMS + REALTIME
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
      console.log("LOAD ERROR:", err);
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
    if (!user || loading) return;

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

      // 💸 deduct first safely
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: balance - stake,
        }
      );

      // 🎮 create room
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: "",
          stake,
          pot: stake,
          status: "waiting",
          gameId: "",
          payoutDone: false,
        }
      );

      popup("✅ Room created");
      setStake(MIN_STAKE);
      loadRooms();
    } catch (err) {
      console.log(err);
      popup("❌ Failed to create room");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN ROOM (SAFE + AUTO UNLOCK)
  // =========================
  async function joinRoom(room) {
    if (!user || loading) return;

    const snipes = [];

    const fail = async (msg, stage, unlockRoom = false) => {
      snipes.push(`❌ FAILED AT: ${stage}`);
      console.log("SNIPES:", snipes);

      if (unlockRoom) {
        try {
          await databases.updateDocument(
            DATABASE_ID,
            SNAKE_LOBBY_COLLECTION,
            room.$id,
            {
              status: "waiting",
              opponentId: ""
            }
          );

          snipes.push("🔓 ROOM UNLOCKED");
        } catch {
          snipes.push("💥 ROOM UNLOCK FAILED");
        }
      }

      popup(msg + " | " + snipes.join(" → "));
      setLoading(false);
      throw new Error(msg);
    };

    try {
      setLoading(true);

      // =========================
      // CHECK ROOM
      // =========================
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id
      );

      if (fresh.opponentId) {
        return fail("Room already taken", "ROOM_CHECK");
      }

      if (fresh.status !== "waiting") {
        return fail("Room not available", "STATUS_CHECK");
      }

      // =========================
      // WALLET CHECK
      // =========================
      const wallet = await getWallet(user.$id);
      if (!wallet) return fail("Wallet missing", "WALLET");

      const balance = Number(wallet.balance || 0);

      if (balance < fresh.stake) {
        return fail("Insufficient funds", "BALANCE_CHECK");
      }

      // =========================
      // LOCK ROOM
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        { status: "locking" }
      );

      snipes.push("🔒 ROOM LOCKED");

      // =========================
      // CREATE GAME
      // =========================
      let game;

      try {
        game = await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: fresh.$id,
            hostId: fresh.hostId,
            opponentId: user.$id,
            turn: fresh.hostId,
            positions: JSON.stringify({ A: 1, B: 1 }),
            history: JSON.stringify([]),
            dice: 1,
            status: "playing",
            winnerId: "",
            payoutDone: false,
            pot: fresh.stake * 2,
          }
        );

        snipes.push("🎮 GAME CREATED");
      } catch (e) {
        return fail("Game creation failed", "GAME_CREATE", true);
      }

      // =========================
      // UPDATE LOBBY
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "playing",
          gameId: game.$id,
        }
      );

      snipes.push("📦 LOBBY UPDATED");

      // =========================
      // DEDUCT WALLET LAST
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: balance - fresh.stake,
        }
      );

      snipes.push("💸 WALLET DEDUCTED");
      snipes.push("✅ JOIN SUCCESS");

      console.log("FINAL SNIPES:", snipes);

      openGame(game.$id, fresh.$id);

    } catch (err) {
      console.log(err);
      popup("❌ Failed to join room");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // RESUME GAME
  // =========================
  function resumeGame(room) {
    if (!room.gameId) return;
    openGame(room.gameId, room.$id);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      {message && <div style={styles.message}>{message}</div>}

      {/* CREATE */}
      <div style={styles.create}>
        <input
          type="number"
          value={stake}
          min={MIN_STAKE}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createRoom} disabled={loading} style={styles.button}>
          Create Room
        </button>
      </div>

      {/* ROOMS */}
      <div style={styles.rooms}>
        {rooms.map((room) => (
          <div key={room.$id} style={styles.room}>
            <div>🎮 Stake: ₦{room.stake}</div>
            <div>🏦 Pot: ₦{room.pot}</div>
            <div>Status: {room.status}</div>

            {room.status === "waiting" && !room.opponentId && (
              <button
                onClick={() => joinRoom(room)}
                style={styles.joinBtn}
                disabled={loading}
              >
                Join
              </button>
            )}

            {room.status === "playing" && (
              <button onClick={() => resumeGame(room)} style={styles.resumeBtn}>
                Resume
              </button>
            )}
          </div>
        ))}
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