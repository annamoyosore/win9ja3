import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";

const ADMIN_ID = "69ef9fe863a02a7490b4";
const ADMIN_CUT_PERCENT = 12;

// =========================
// WALLET FETCH
// =========================
async function getWallet(userId) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    WALLET_COLLECTION,
    [Query.equal("userId", userId), Query.limit(1)]
  );

  return res.documents[0];
}

export default function Snakelobby({ goGame }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [lobbies, setLobbies] = useState([]);
  const [stake, setStake] = useState("");
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      const w = await getWallet(u.$id);
      setWallet(w);

      loadLobbies(u.$id);
    } catch (err) {
      console.error(err);
    }
  }

  // =========================
  // LOAD WAITING LOBBIES ONLY
  // =========================
  async function loadLobbies(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      [Query.limit(100)]
    );

    const waiting = res.documents.filter((m) => {
      return (
        (m.status || "").toLowerCase() === "waiting" &&
        !m.opponentId &&
        m.hostId !== userId
      );
    });

    setLobbies(waiting);
  }

  // =========================
  // CREATE LOBBY
  // =========================
  async function createLobby() {
    const amount = Number(stake);

    if (!amount || amount < 150) {
      return alert("Minimum stake is ₦150");
    }

    if (!wallet || wallet.balance < amount) {
      return alert("Insufficient balance");
    }

    setLoading(true);

    try {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - amount
        }
      );

      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          status: "waiting",
          gameId: null,
          pot: amount,
          refundDone: false
        }
      );

      setStake("");
      loadLobbies(user.$id);

    } catch (err) {
      console.error(err);
      alert(err.message);
    }

    setLoading(false);
  }

  // =========================
  // JOIN LOBBY → MATCHED CREATES GAME
  // =========================
  async function joinLobby(lobby) {
    if (joining) return;

    setJoining(lobby.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id
      );

      // 🚫 prevent self join
      if (fresh.hostId === user.$id) {
        throw new Error("Cannot join your own lobby");
      }

      // 🚫 already taken
      if (fresh.opponentId) {
        throw new Error("Lobby already matched");
      }

      const amount = Number(fresh.stake);

      if (!wallet || wallet.balance < amount) {
        throw new Error("Insufficient balance");
      }

      // 💰 deduct wallet
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - amount
        }
      );

      // 🔒 STEP 1: set MATCHED (TRIGGER STATE)
      const matchedLobby = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched"
        }
      );

      const total = amount * 2;
      const adminCut = Math.floor((total * ADMIN_CUT_PERCENT) / 100);
      const finalPot = total - adminCut;

      // 🎮 STEP 2: CREATE GAME (ONLY HERE)
      const game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          lobbyId: matchedLobby.$id,
          hostId: matchedLobby.hostId,
          opponentId: user.$id,
          status: "running",
          turn: matchedLobby.hostId,
          pot: finalPot,
          payoutDone: false
        }
      );

      // 🔗 STEP 3: LINK GAME TO LOBBY
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        matchedLobby.$id,
        {
          gameId: game.$id,
          pot: finalPot
        }
      );

      // 🚀 OPEN GAME IMMEDIATELY
      goGame(game.$id, amount);

    } catch (err) {
      console.error(err);
      alert(err.message);
    }

    setJoining(null);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Lobby</h2>

      <input
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake (min ₦150)"
      />

      <button onClick={createLobby} disabled={loading}>
        {loading ? "Creating..." : "Create Lobby"}
      </button>

      <h3>🟡 Waiting Lobbies</h3>

      {lobbies.length === 0 && <p>No lobbies available</p>}

      {lobbies.map((l) => (
        <div key={l.$id} style={styles.card}>
          <p>₦{l.stake}</p>

          <button onClick={() => joinLobby(l)} disabled={joining === l.$id}>
            {joining === l.$id ? "Joining..." : "Join"}
          </button>
        </div>
      ))}
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
    minHeight: "100vh"
  },

  card: {
    background: "#1e293b",
    padding: 12,
    margin: 10,
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }
};