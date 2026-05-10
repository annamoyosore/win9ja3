import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID
} from "../lib/appwrite";

const GAME_COLLECTION = "snakegame";
const WALLET_COLLECTION = "wallets";

const MAX_ACTIVE = 5;
const MAX_PLAYERS = 2;

export default function SnakeLobby({ goGame, back }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [games, setGames] = useState([]);
  const [activeGame, setActiveGame] = useState(null);

  const [stake, setStake] = useState(200);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    init();
    const t = setInterval(loadGames, 5000);
    return () => clearInterval(t);
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [{ method: "equal", attribute: "userId", values: [u.$id] }]
    );

    if (w.documents?.length) setWallet(w.documents[0]);

    await loadGames();
  }

  // =========================
  // SAFE PARSER
  // =========================
  function safeJSON(d, fb) {
    try {
      if (!d) return fb;
      if (typeof d === "object") return d;
      return JSON.parse(d);
    } catch {
      return fb;
    }
  }

  // =========================
  // LOAD GAMES (ONLY USER-RELATED)
  // =========================
  async function loadGames() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      GAME_COLLECTION
    );

    const mine = (res.documents || []).filter((g) => {
      const players = safeJSON(g.players, []);

      return players.includes(user?.$id);
    });

    setGames(mine);

    // 👇 find running game
    const running = mine.find((g) => g.status !== "finished");
    setActiveGame(running || null);
  }

  // =========================
  // LIMIT CHECK
  // =========================
  function canPlayMore() {
    const running = games.filter((g) => g.status !== "finished");
    return running.length < MAX_ACTIVE;
  }

  // =========================
  // CREATE GAME
  // =========================
  async function createGame() {
    if (!canPlayMore()) return setMsg("Finish a game first (max 5)");

    if (wallet.balance < stake) return setMsg("Insufficient balance");

    const u = await account.get();

    await databases.createDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      ID.unique(),
      {
        hostId: u.$id,
        stake,
        players: JSON.stringify([u.$id]),
        positions: JSON.stringify({ A: 1, B: 1 }),
        turn: "A",
        status: "waiting",
        winner: ""
      }
    );

    setMsg("Game created");
    loadGames();
  }

  // =========================
  // JOIN GAME
  // =========================
  async function joinGame(game) {
    const u = await account.get();

    if (game.hostId === u.$id) {
      return setMsg("You cannot join your own game");
    }

    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      game.$id
    );

    const players = safeJSON(fresh.players, []);

    if (players.includes(u.$id)) {
      return goGame?.(fresh.$id);
    }

    if (players.length >= MAX_PLAYERS) {
      return setMsg("Game full");
    }

    if (wallet.balance < fresh.stake) {
      return setMsg("Insufficient balance");
    }

    players.push(u.$id);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      fresh.$id,
      {
        players: JSON.stringify(players),
        status: players.length === 2 ? "playing" : "waiting"
      }
    );

    goGame?.(fresh.$id);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <p style={{ color: "yellow" }}>{msg}</p>

      {/* CREATE */}
      <div style={styles.card}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          style={styles.input}
        />

        <button onClick={createGame} style={styles.createBtn}>
          Create Game
        </button>
      </div>

      {/* MY RUNNING GAME (ONLY USER CAN SEE) */}
      {activeGame && (
        <div style={styles.active}>
          <h3>🔥 Your Running Game</h3>
          <p>Status: {activeGame.status}</p>

          <button
            style={styles.resumeBtn}
            onClick={() => goGame?.(activeGame.$id)}
          >
            ▶ Resume Game
          </button>
        </div>
      )}

      {/* AVAILABLE GAMES */}
      <h3>🎮 Available Games</h3>

      {games
        .filter((g) => g.status === "waiting")
        .map((g) => {
          const players = safeJSON(g.players, []);

          return (
            <div key={g.$id} style={styles.room}>
              <p>Stake ₦{g.stake}</p>
              <p>Players: {players.length}/{MAX_PLAYERS}</p>

              <button onClick={() => joinGame(g)}>
                Join Game
              </button>
            </div>
          );
        })}

      <button onClick={back}>Back</button>
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
    padding: 10
  },

  createBtn: {
    background: "orange",
    padding: 10,
    width: "100%",
    marginTop: 10,
    fontWeight: "bold"
  },

  room: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 10
  },

  active: {
    background: "#065f46",
    padding: 15,
    marginTop: 15,
    borderRadius: 10
  },

  resumeBtn: {
    background: "#22c55e",
    padding: 10,
    border: "none",
    color: "white",
    borderRadius: 8,
    fontWeight: "bold"
  }
};