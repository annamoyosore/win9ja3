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
const MAX_RUNNING_GAMES = 5;
const ADMIN_CUT_PERCENT = 0.1;

export default function SnakeLobby({ goGame, back }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState(200);

  const [availableGames, setAvailableGames] = useState([]);
  const [myGames, setMyGames] = useState([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // =========================
  // LOAD ONCE ONLY
  // =========================
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      const walletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [
          Query.equal("userId", u.$id),
          Query.limit(1)
        ]
      );

      if (walletRes.documents.length) {
        setWallet(walletRes.documents[0]);
      }

      await loadGames(u.$id);

    } catch (err) {
      console.log(err);
    }
  }

  // =========================
  // LOAD GAMES
  // =========================
  async function loadGames(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [
          Query.limit(100),
          Query.orderDesc("$createdAt")
        ]
      );

      const docs = res.documents;

      // =========================
      // AVAILABLE GAMES
      // =========================
      const available = docs.filter((g) => {
        try {
          const players = JSON.parse(g.players || "[]");

          return (
            g.status === "waiting" &&
            players.length < MAX_PLAYERS &&
            !players.includes(userId)
          );
        } catch {
          return false;
        }
      });

      // =========================
      // MY RUNNING GAMES
      // =========================
      const mine = docs.filter((g) => {
        try {
          const players = JSON.parse(g.players || "[]");

          return (
            players.includes(userId) &&
            g.status !== "finished"
          );
        } catch {
          return false;
        }
      });

      setAvailableGames(available);
      setMyGames(mine);

    } catch (err) {
      console.log(err);
    }
  }

  // =========================
  // ACTIVE GAME LIMIT
  // =========================
  function runningCount() {
    return myGames.filter(
      (g) => g.status !== "finished"
    ).length;
  }

  // =========================
  // DEDUCT WALLET
  // =========================
  async function deductWallet(amount) {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: Number(wallet.balance) - Number(amount)
      }
    );

    setWallet((prev) => ({
      ...prev,
      balance: Number(prev.balance) - Number(amount)
    }));
  }

  // =========================
  // CREATE GAME
  // =========================
  async function createRoom() {
    try {
      if (loading) return;

      setLoading(true);
      setMessage("");

      if (runningCount() >= MAX_RUNNING_GAMES) {
        setMessage("Finish your running games first");
        setLoading(false);
        return;
      }

      if (!stake || stake < 200) {
        setMessage("Minimum stake is ₦200");
        setLoading(false);
        return;
      }

      if (Number(wallet?.balance || 0) < Number(stake)) {
        setMessage("Insufficient balance");
        setLoading(false);
        return;
      }

      const u = await account.get();

      // deduct host money
      await deductWallet(stake);

      // create lobby
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: u.$id,
          stake: Number(stake),
          status: "waiting",
          players: JSON.stringify([u.$id]),
          playerCount: 1,
          gameId: ""
        }
      );

      setMessage("Game created. Waiting for opponent.");

      await loadGames(u.$id);

    } catch (err) {
      console.log(err);
      setMessage("Failed to create game");
    }

    setLoading(false);
  }

  // =========================
  // JOIN GAME
  // =========================
  async function joinRoom(room) {
    try {
      if (loading) return;

      setLoading(true);
      setMessage("");

      if (runningCount() >= MAX_RUNNING_GAMES) {
        setMessage("Finish your running games first");
        setLoading(false);
        return;
      }

      const u = await account.get();

      // prevent self join
      if (room.hostId === u.$id) {
        setMessage("Cannot join your own game");
        setLoading(false);
        return;
      }

      // fresh lobby
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id
      );

      const players = JSON.parse(fresh.players || "[]");

      if (
        fresh.status !== "waiting" ||
        players.length >= MAX_PLAYERS
      ) {
        setMessage("Game unavailable");
        setLoading(false);
        return;
      }

      if (players.includes(u.$id)) {
        setMessage("Already joined");

        if (fresh.gameId) {
          goGame(fresh.gameId);
        }

        setLoading(false);
        return;
      }

      if (Number(wallet?.balance || 0) < Number(fresh.stake)) {
        setMessage("Insufficient balance");
        setLoading(false);
        return;
      }

      // deduct opponent
      await deductWallet(fresh.stake);

      const updatedPlayers = [...players, u.$id];

      // total pot
      const totalPot =
        Number(fresh.stake) * MAX_PLAYERS;

      const adminCut =
        totalPot * ADMIN_CUT_PERCENT;

      const finalPot =
        totalPot - adminCut;

      // =========================
      // PAY ADMIN
      // =========================
      const adminRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [
          Query.equal("userId", ADMIN_USER_ID),
          Query.limit(1)
        ]
      );

      if (adminRes.documents.length) {
        const adminWallet = adminRes.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.$id,
          {
            balance:
              Number(adminWallet.balance) +
              Number(adminCut)
          }
        );
      }

      // =========================
      // CREATE GAME
      // =========================
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          lobbyId: fresh.$id,
          players: JSON.stringify(updatedPlayers),
          positions: JSON.stringify({
            A: 1,
            B: 1
          }),
          history: JSON.stringify([]),
          turn: "A",
          winner: "",
          status: "playing",
          pot: finalPot,
          payoutDone: false
        }
      );

      // =========================
      // UPDATE LOBBY
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          players: JSON.stringify(updatedPlayers),
          playerCount: 2,
          status: "playing",
          gameId: game.$id
        }
      );

      setMessage("Game started");

      await loadGames(u.$id);

      goGame(game.$id);

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

      <div style={styles.topCard}>
        <p>
          Running Games: {runningCount()} / {MAX_RUNNING_GAMES}
        </p>

        <input
          type="number"
          value={stake}
          min="200"
          onChange={(e) =>
            setStake(Number(e.target.value))
          }
          style={styles.input}
        />

        <button
          onClick={createRoom}
          disabled={loading}
          style={styles.createBtn}
        >
          {loading ? "Loading..." : "Create Game"}
        </button>

        {message && (
          <p style={styles.message}>
            {message}
          </p>
        )}
      </div>

      {/* ========================= */}
      {/* MY GAMES */}
      {/* ========================= */}
      <h3 style={styles.heading}>
        🎮 Your Running Games
      </h3>

      {myGames.length === 0 && (
        <p>No running games</p>
      )}

      {myGames.map((g) => (
        <div
          key={g.$id}
          style={styles.room}
        >
          <div>
            <p>Stake: ₦{g.stake}</p>
            <p>Status: {g.status}</p>
          </div>

          {g.gameId ? (
            <button
              style={styles.resumeBtn}
              onClick={() => goGame(g.gameId)}
            >
              Resume
            </button>
          ) : (
            <button
              style={styles.waitBtn}
              disabled
            >
              Waiting...
            </button>
          )}
        </div>
      ))}

      {/* ========================= */}
      {/* AVAILABLE */}
      {/* ========================= */}
      <h3 style={styles.heading}>
        🎯 Available Games
      </h3>

      {availableGames.length === 0 && (
        <p>No available games</p>
      )}

      {availableGames.map((r) => (
        <div
          key={r.$id}
          style={styles.room}
        >
          <div>
            <p>Stake: ₦{r.stake}</p>
            <p>
              Players: {r.playerCount}/2
            </p>
          </div>

          <button
            style={styles.joinBtn}
            onClick={() => joinRoom(r)}
          >
            Join
          </button>
        </div>
      ))}

      <button
        onClick={back}
        style={styles.backBtn}
      >
        Back
      </button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    background: "#020617",
    color: "white",
    minHeight: "100vh",
    padding: 20
  },

  topCard: {
    background: "#111827",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20
  },

  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    marginBottom: 10,
    fontSize: 16
  },

  createBtn: {
    width: "100%",
    padding: 14,
    borderRadius: 10,
    border: "none",
    background: "orange",
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    cursor: "pointer"
  },

  heading: {
    marginTop: 25
  },

  room: {
    background: "#111827",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  joinBtn: {
    background: "gold",
    color: "black",
    border: "none",
    padding: "10px 18px",
    borderRadius: 10,
    fontWeight: "bold",
    cursor: "pointer"
  },

  resumeBtn: {
    background: "#16a34a",
    color: "white",
    border: "none",
    padding: "10px 18px",
    borderRadius: 10,
    fontWeight: "bold",
    cursor: "pointer"
  },

  waitBtn: {
    background: "#374151",
    color: "white",
    border: "none",
    padding: "10px 18px",
    borderRadius: 10,
    fontWeight: "bold"
  },

  backBtn: {
    width: "100%",
    marginTop: 20,
    padding: 14,
    borderRadius: 10,
    border: "none",
    background: "#ef4444",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer"
  },

  message: {
    marginTop: 10,
    color: "#facc15"
  }
};