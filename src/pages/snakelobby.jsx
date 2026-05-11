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
const SNAKE_LOBBY_COLLECTION =
  "snakelobby";

const SNAKE_GAME_COLLECTION =
  "snakegames";

const WALLET_COLLECTION =
  "wallets";

// ✅ ADMIN USER ID
const ADMIN_USER_ID =
  "YOUR_ADMIN_USER_ID";

// =========================
// COMPONENT
// =========================
export default function SnakeLobby({
  openGame,
  goHome,
}) {
  const [user, setUser] =
    useState(null);

  const [rooms, setRooms] =
    useState([]);

  const [stake, setStake] =
    useState(100);

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
  // LOAD LOBBIES
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

    return () => unsub();
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
  // GET WALLET
  // =========================
  async function getWallet(
    uid
  ) {
    const res =
      await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [
          Query.equal(
            "userId",
            uid
          ),
          Query.limit(1),
        ]
      );

    if (!res.documents.length)
      return null;

    return res.documents[0];
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    try {
      setLoading(true);

      const wallet =
        await getWallet(
          user.$id
        );

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

      // 💸 DEDUCT HOST STAKE
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance:
            balance - stake,
        }
      );

      // 🎮 CREATE LOBBY
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,

          hostName:
            "Player A",

          opponentId: "",

          opponentName: "",

          stake,

          pot: stake,

          adminCut: 0,

          status: "waiting",

          payoutDone: false,

          winnerId: "",

          gameId: "",
        }
      );

      setMessage(
        "Room created"
      );

      loadRooms();
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

      // 🚫 BLOCK HOST
      if (
        room.hostId ===
        user.$id
      ) {
        return;
      }

      // 🚫 ROOM FULL
      if (
        room.opponentId
      ) {
        setMessage(
          "Room already full"
        );
        return;
      }

      const wallet =
        await getWallet(
          user.$id
        );

      if (!wallet) {
        setMessage(
          "Wallet not found"
        );
        return;
      }

      const balance = Number(
        wallet.balance || 0
      );

      const roomStake =
        Number(
          room.stake || 0
        );

      if (
        balance < roomStake
      ) {
        setMessage(
          "Insufficient balance"
        );
        return;
      }

      // 💸 DEDUCT PLAYER B STAKE
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance:
            balance -
            roomStake,
        }
      );

      // =========================
      // 💰 CALCULATE POT
      // =========================
      const totalPot =
        roomStake +
        roomStake;

      // ✅ ADMIN CUT
      const adminCut =
        Math.floor(
          totalPot * 0.1
        );

      // ✅ FINAL WIN POT
      const gamePot =
        totalPot -
        adminCut;

      // =========================
      // 💰 CREDIT ADMIN
      // =========================
      const adminWallet =
        await getWallet(
          ADMIN_USER_ID
        );

      if (adminWallet) {
        const current =
          Number(
            adminWallet.balance ||
              0
          );

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.$id,
          {
            balance:
              current +
              adminCut,
          }
        );
      }

      // =========================
      // 🎮 CREATE GAME
      // =========================
      const game =
        await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId:
              room.$id,

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
              JSON.stringify(
                []
              ),

            dice: 1,

            winner: "",

            winnerId: "",

            status:
              "playing",

            payoutDone: false,

            pot: gamePot,
          }
        );

      // =========================
      // 🏦 UPDATE LOBBY
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          opponentId:
            user.$id,

          opponentName:
            "Player B",

          adminCut,

          pot: gamePot,

          gameId:
            game.$id,

          status:
            "playing",
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
  function resumeGame(
    room
  ) {
    if (!room.gameId)
      return;

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
        <div style={styles.message}>
          {message}
        </div>
      )}

      {/* CREATE */}
      <div style={styles.create}>
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
          style={styles.button}
          disabled={loading}
        >
          Create Room
        </button>
      </div>

      {/* ROOMS */}
      <div style={styles.rooms}>
        {rooms.map(
          (room) => {
            const isHost =
              room.hostId ===
              user?.$id;

            const isOpponent =
              room.opponentId ===
              user?.$id;

            return (
              <div
                key={room.$id}
                style={
                  styles.room
                }
              >
                <div>
                  🎮 Stake:
                  ₦
                  {
                    room.stake
                  }
                </div>

                <div>
                  🏦 Pot:
                  ₦
                  {room.pot}
                </div>

                <div>
                  Status:
                  {" "}
                  {
                    room.status
                  }
                </div>

                {/* JOIN */}
                {room.status ===
                  "waiting" &&
                  !isHost && (
                    <button
                      style={
                        styles.joinBtn
                      }
                      onClick={() =>
                        joinRoom(
                          room
                        )
                      }
                    >
                      Join
                    </button>
                  )}

                {/* HOST WAIT */}
                {isHost &&
                  room.status ===
                    "waiting" && (
                    <div
                      style={{
                        color:
                          "gold",
                      }}
                    >
                      Waiting
                      for
                      opponent...
                    </div>
                  )}

                {/* RESUME */}
                {(isHost ||
                  isOpponent) &&
                  room.status ===
                    "playing" && (
                    <button
                      style={
                        styles.resumeBtn
                      }
                      onClick={() =>
                        resumeGame(
                          room
                        )
                      }
                    >
                      Resume
                      Game
                    </button>
                  )}
              </div>
            );
          }
        )}
      </div>

      {/* EXIT */}
      <button
        style={
          styles.exitBtn
        }
        onClick={goHome}
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
    background:
      "#0f172a",
    color: "white",
    padding: 20,
    textAlign: "center",
  },

  message: {
    background:
      "#dc2626",
    padding: 10,
    borderRadius: 10,
    marginBottom: 15,
  },

  create: {
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
  },

  button: {
    padding:
      "12px 18px",
    borderRadius: 10,
    border: "none",
    background:
      "#22c55e",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },

  rooms: {
    maxWidth: 420,
    margin: "0 auto",
  },

  room: {
    background:
      "#111827",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    lineHeight: 1.8,
  },

  joinBtn: {
    marginTop: 10,
    padding:
      "10px 15px",
    borderRadius: 10,
    border: "none",
    background:
      "#2563eb",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },

  resumeBtn: {
    marginTop: 10,
    padding:
      "10px 15px",
    borderRadius: 10,
    border: "none",
    background:
      "gold",
    color: "black",
    fontWeight: "bold",
    cursor: "pointer",
  },

  exitBtn: {
    marginTop: 20,
    padding:
      "12px 20px",
    borderRadius: 10,
    border: "none",
    background:
      "#ef4444",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
};