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
const SNAKE_GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

// =========================
// COMPONENT
// =========================
export default function SnakeLobby({
  openGame,
  goHome,
}) {
  const [user, setUser] = useState(null);

  const [rooms, setRooms] = useState([]);

  const [stake, setStake] = useState(100);

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

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

    const unsub =
      databases.client.subscribe(
        `databases.${DATABASE_ID}.collections.${SNAKE_LOBBY_COLLECTION}.documents`,
        () => {
          loadRooms();
        }
      );

    return () => {
      unsub();
    };
  }, [user]);

  // =========================
  // LOAD ROOMS
  // =========================
  async function loadRooms() {
    try {
      const res =
        await databases.listDocuments(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          [
            Query.notEqual(
              "status",
              "finished"
            ),
          ]
        );

      setRooms(res.documents);
    } catch (err) {
      console.log(err);
    }
  }

  // =========================
  // CHECK WALLET
  // =========================
  async function getWallet() {
    const res =
      await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [
          Query.equal(
            "userId",
            user.$id
          ),
        ]
      );

    if (!res.documents.length) {
      return null;
    }

    return res.documents[0];
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    try {
      setLoading(true);

      const wallet =
        await getWallet();

      if (!wallet) {
        setMessage(
          "Wallet not found"
        );

        return;
      }

      const balance = Number(
        wallet.balance || 0
      );

      if (balance < stake) {
        setMessage(
          "Insufficient balance"
        );

        return;
      }

      // 💸 DEDUCT STAKE
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance:
            balance - stake,
        }
      );

      // 🏦 CREATE LOBBY
      const lobby =
        await databases.createDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          ID.unique(),
          {
            hostId: user.$id,

            hostName:
              user.name ||
              "Player A",

            opponentId: "",

            opponentName: "",

            players: JSON.stringify([
              user.$id,
            ]),

            stake,

            pot: stake,

            status: "waiting",

            payoutDone: false,

            winnerId: "",

            gameId: "",
          }
        );

      setMessage(
        "Room created"
      );

    } catch (err) {
      console.log(err);

      setMessage(
        "Failed to create room"
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    try {
      setLoading(true);

      // 🚫 CANNOT JOIN OWN ROOM
      if (
        room.hostId === user.$id
      ) {
        return;
      }

      const wallet =
        await getWallet();

      if (!wallet) {
        setMessage(
          "Wallet not found"
        );

        return;
      }

      const balance = Number(
        wallet.balance || 0
      );

      const stakeAmount =
        Number(room.stake || 0);

      if (
        balance < stakeAmount
      ) {
        setMessage(
          "Insufficient balance"
        );

        return;
      }

      // 💸 DEDUCT STAKE
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance:
            balance -
            stakeAmount,
        }
      );

      // 🎮 CREATE GAME
      const game =
        await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: room.$id,

            hostId:
              room.hostId,

            opponentId:
              user.$id,

            turn:
              room.hostId,

            positions:
              JSON.stringify({
                A: 1,
                B: 1,
              }),

            history:
              JSON.stringify([]),

            winner: "",

            winnerId: "",

            status: "playing",

            payoutDone: false,

            pot:
              Number(
                room.pot || 0
              ) + stakeAmount,
          }
        );

      // 🏦 UPDATE LOBBY
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          opponentId:
            user.$id,

          opponentName:
            user.name ||
            "Player B",

          players:
            JSON.stringify([
              room.hostId,
              user.$id,
            ]),

          pot:
            Number(
              room.pot || 0
            ) + stakeAmount,

          status: "playing",

          gameId: game.$id,
        }
      );

      // 🚀 OPEN GAME
      openGame(
        game.$id,
        room.$id
      );

    } catch (err) {
      console.log(err);

      setMessage(
        "Failed to join room"
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // RESUME GAME
  // =========================
  async function resumeRoom(room) {
    if (!room.gameId) return;

    openGame(
      room.gameId,
      room.$id
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>
        🐍 Snake Lobby
      </h2>

      {/* MESSAGE */}
      {message && (
        <div style={styles.msg}>
          {message}
        </div>
      )}

      {/* CREATE */}
      <div style={styles.createBox}>
        <input
          type="number"
          value={stake}
          min={100}
          onChange={(e) =>
            setStake(
              Number(
                e.target.value
              )
            )
          }
          style={styles.input}
        />

        <button
          onClick={
            createRoom
          }
          disabled={loading}
          style={styles.button}
        >
          Create Room
        </button>
      </div>

      {/* ROOMS */}
      <div style={styles.rooms}>
        {rooms.length === 0 && (
          <div>
            No rooms yet
          </div>
        )}

        {rooms.map((room) => {
          const isHost =
            room.hostId ===
            user?.$id;

          const joined =
            room.opponentId ===
            user?.$id;

          return (
            <div
              key={room.$id}
              style={styles.room}
            >
              <div>
                🎮 Stake: ₦
                {room.stake}
              </div>

              <div>
                🏦 Pot: ₦
                {room.pot}
              </div>

              <div>
                Status:{" "}
                {
                  room.status
                }
              </div>

              {/* WAITING */}
              {room.status ===
                "waiting" &&
                !isHost && (
                  <button
                    onClick={() =>
                      joinRoom(
                        room
                      )
                    }
                    style={
                      styles.joinBtn
                    }
                  >
                    Join
                  </button>
                )}

              {/* HOST */}
              {isHost &&
                room.status ===
                  "waiting" && (
                  <div
                    style={{
                      color:
                        "gold",
                    }}
                  >
                    Waiting for
                    opponent...
                  </div>
                )}

              {/* RESUME */}
              {(isHost ||
                joined) &&
                room.status ===
                  "playing" && (
                  <button
                    onClick={() =>
                      resumeRoom(
                        room
                      )
                    }
                    style={
                      styles.resumeBtn
                    }
                  >
                    Resume Game
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {/* EXIT */}
      <button
        onClick={goHome}
        style={
          styles.exitBtn
        }
      >
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
    color: "white",
    padding: 20,
    textAlign: "center",
  },

  msg: {
    background: "#dc2626",
    padding: 10,
    borderRadius: 10,
    marginBottom: 15,
  },

  createBox: {
    display: "flex",
    justifyContent:
      "center",
    gap: 10,
    marginBottom: 20,
  },

  input: {
    padding: 12,
    borderRadius: 10,
    border: "none",
    width: 120,
    fontSize: 16,
  },

  button: {
    padding:
      "12px 18px",
    borderRadius: 10,
    border: "none",
    background: "gold",
    fontWeight: "bold",
    cursor: "pointer",
  },

  rooms: {
    maxWidth: 400,
    margin: "0 auto",
  },

  room: {
    background: "#111827",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    lineHeight: 1.8,
  },

  joinBtn: {
    marginTop: 10,
    padding:
      "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },

  resumeBtn: {
    marginTop: 10,
    padding:
      "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },

  exitBtn: {
    marginTop: 20,
    padding:
      "12px 18px",
    borderRadius: 10,
    border: "none",
    background: "#ef4444",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
};