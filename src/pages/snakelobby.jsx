import { useEffect, useRef, useState } from "react";
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
// 🎵 SOUND
// =========================
function playTurnSound() {
  try {
    const ctx =
      new (window.AudioContext || window.webkitAudioContext)();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.setValueAtTime(980, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(620, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {}
}

// =========================
// CREATE GAME
// =========================
async function createGame(lobby, opponentId, pot) {
  return await databases.createDocument(
    DATABASE_ID,
    SNAKE_GAME_COLLECTION,
    ID.unique(),
    {
      lobbyId: lobby.$id,
      players: `${lobby.hostId},${opponentId}`,
      status: "running",
      turn: lobby.hostId,
      payoutDone: false,
      pot: pot // ✅ FINAL POT STORED HERE
    }
  );
}

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    init();
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

    loadMatches(u.$id);
  }

  // =========================
  // LOAD LOBBIES
  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      [Query.equal("status", "waiting")]
    );

    const available = res.documents.filter(
      (m) => m.hostId !== userId && !m.opponentId
    );

    setMatches(available);
  }

  // =========================
  // CREATE LOBBY
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount < 150) {
      return alert("Minimum stake is ₦150");
    }

    if (wallet.balance < amount) {
      return alert("Insufficient balance");
    }

    setCreating(true);

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
      loadMatches(user.$id);

    } catch (err) {
      alert(err.message);
    }

    setCreating(false);
  }

  // =========================
  // JOIN LOBBY
  // =========================
  async function joinMatch(lobby) {
    if (loadingJoin) return;

    setLoadingJoin(lobby.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id
      );

      if (fresh.hostId === user.$id || fresh.opponentId) {
        throw new Error("Cannot join this lobby");
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        throw new Error("Insufficient balance");
      }

      // 💰 deduct opponent stake
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - fresh.stake
        }
      );

      // =========================
      // POT CALCULATION
      // =========================
      const total = fresh.stake * 2;
      const adminCut = Math.floor((total * ADMIN_CUT_PERCENT) / 100);
      const finalPot = total - adminCut;

      // =========================
      // CREATE GAME WITH FINAL POT
      // =========================
      const game = await createGame(fresh, user.$id, finalPot);

      // =========================
      // UPDATE LOBBY
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          gameId: game.$id
        }
      );

      // =========================
      // ADMIN CUT PAYMENT
      // =========================
      const adminRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID), Query.limit(1)]
      );

      if (adminRes.documents.length) {
        const admin = adminRes.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          admin.$id,
          {
            balance: Number(admin.balance || 0) + adminCut
          }
        );
      }

      goGame(game.$id, fresh.stake);

    } catch (err) {
      alert(err.message);
    }

    setLoadingJoin(null);
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

      <button onClick={createMatch} disabled={creating}>
        {creating ? "Creating..." : "Create Lobby"}
      </button>

      <h3>Available Lobbies</h3>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>₦{m.stake}</p>

          <button
            onClick={() => joinMatch(m)}
            disabled={loadingJoin === m.$id}
          >
            {loadingJoin === m.$id ? "Joining..." : "Join"}
          </button>
        </div>
      ))}
    </div>
  );
}

// =========================
// STYLE
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
    padding: 10,
    margin: 10,
    borderRadius: 10
  }
};