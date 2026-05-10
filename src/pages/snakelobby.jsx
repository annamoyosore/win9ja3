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
const ADMIN_CUT = 0.1;

export default function SnakeLobby({ goGame, back }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState(200);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [availableGames, setAvailableGames] = useState([]);
  const [myGames, setMyGames] = useState([]);

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    init();
    const t = setInterval(loadGames, 4000);
    return () => clearInterval(t);
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

    loadGames(u.$id);
  }

  // =========================
  // LOAD GAMES (FIXED FILTERING)
  // =========================
  async function loadGames(uid) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.limit(100)]
      );

      const all = res.documents;

      // AVAILABLE = waiting + not host + not joined
      const available = all.filter(g => {
        const players = safeParse(g.players, []);
        const joined = safeParse(g.joinedUsers, {});

        return (
          g.status === "waiting" &&
          g.hostId !== uid &&
          !joined[uid]
        );
      });

      // MY GAMES = host OR joined OR active game
      const mine = all.filter(g => {
        const players = safeParse(g.players, []);
        const joined = safeParse(g.joinedUsers, {});

        return (
          g.hostId === uid ||
          joined[uid]
        );
      });

      setAvailableGames(available);
      setMyGames(mine);

    } catch (err) {
      console.log(err);
    }
  }

  function safeParse(data, fallback) {
    try {
      if (!data) return fallback;
      if (typeof data === "object") return data;
      return JSON.parse(data);
    } catch {
      return fallback;
    }
  }

  // =========================
  // WALLET SAFE UPDATE
  // =========================
  async function updateWallet(amount) {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id
    );

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: Number(fresh.balance) + amount
      }
    );
  }

  async function deductWallet(amount) {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id
    );

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: Number(fresh.balance) - amount
      }
    );
  }

  // =========================
  // CREATE ROOM
  // =========================
  async function createRoom() {
    if (!user || loading) return;

    setLoading(true);
    setMessage("");

    try {
      if (stake < 200) {
        setMessage("Minimum stake is ₦200");
        return;
      }

      const freshWallet = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id
      );

      if (Number(freshWallet.balance) < stake) {
        setMessage("Insufficient balance");
        return;
      }

      await deductWallet(stake);

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          stake,
          status: "waiting",
          players: JSON.stringify([user.$id]),
          joinedUsers: JSON.stringify({ [user.$id]: true }),
          gameId: ""
        }
      );

      setMessage("Room created");

    } catch (e) {
      console.log(e);
      setMessage("Create failed");
    }

    setLoading(false);
    loadGames(user.$id);
  }

  // =========================
  // JOIN ROOM
  // =========================
  async function joinRoom(room) {
    if (loading) return;

    setLoading(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id
      );

      if (fresh.hostId === user.$id) {
        setMessage("You cannot join your own game");
        return;
      }

      const players = safeParse(fresh.players, []);
      const joined = safeParse(fresh.joinedUsers, {});

      if (joined[user.$id]) {
        setMessage("Already joined");
        return;
      }

      if (players.length >= MAX_PLAYERS) {
        setMessage("Room full");
        return;
      }

      const freshWallet = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id
      );

      if (Number(freshWallet.balance) < fresh.stake) {
        setMessage("Insufficient balance");
        return;
      }

      await deductWallet(fresh.stake);

      players.push(user.$id);
      joined[user.$id] = true;

      const full = players.length === MAX_PLAYERS;

      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        room.$id,
        {
          players: JSON.stringify(players),
          joinedUsers: JSON.stringify(joined),
          status: full ? "matched" : "waiting"
        }
      );

      if (full) {
        const total = fresh.stake * 2;
        const adminCut = total * ADMIN_CUT;

        const admin = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", ADMIN_USER_ID), Query.limit(1)]
        );

        if (admin.documents.length) {
          const aw = admin.documents[0];

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            aw.$id,
            {
              balance: Number(aw.balance) + adminCut
            }
          );
        }

        const game = await databases.createDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          ID.unique(),
          {
            lobbyId: room.$id,
            players: JSON.stringify(players),
            status: "playing",
            turn: players[0],
            pot: total - adminCut,
            winner: ""
          }
        );

        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          room.$id,
          {
            gameId: game.$id,
            status: "playing"
          }
        );

        goGame(game.$id);
      }

    } catch (e) {
      console.log(e);
      setMessage("Join failed");
    }

    setLoading(false);
    loadGames(user.$id);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <div style={styles.box}>
        <input
          type="number"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
        />

        <button onClick={createRoom} disabled={loading} style={styles.create}>
          Create Room
        </button>

        <p>{message}</p>
      </div>

      <h3>🔥 Your Active Game</h3>

      {myGames.map(g => {
        const players = safeParse(g.players, []);
        return (
          <div key={g.$id} style={styles.card}>
            <p>Status: {g.status}</p>

            {g.gameId && (
              <button
                style={styles.resume}
                onClick={() => goGame(g.gameId)}
              >
                ▶ Resume
              </button>
            )}
          </div>
        );
      })}

      <h3>🎯 Available Games</h3>

      {availableGames.map(g => (
        <div key={g.$id} style={styles.card}>
          <p>Stake: ₦{g.stake}</p>

          <button onClick={() => joinRoom(g)} disabled={loading}>
            Join
          </button>
        </div>
      ))}

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
  box: {
    background: "#1e293b",
    padding: 10,
    borderRadius: 10
  },
  card: {
    background: "#111827",
    padding: 10,
    marginTop: 10,
    borderRadius: 8
  },
  create: {
    background: "orange",
    padding: 10,
    width: "100%",
    marginTop: 10,
    border: "none",
    borderRadius: 8
  },
  resume: {
    background: "green",
    padding: 10,
    borderRadius: 8,
    color: "white",
    border: "none"
  }
};