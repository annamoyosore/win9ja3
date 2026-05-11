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
// SOUND
// =========================
function playTurnSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

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
      pot
    }
  );
}

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);

  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  const notifiedTurns = useRef({});

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

    loadLobbies(u.$id);
  }

  // =========================
  // LOAD LOBBIES
  // =========================
  async function loadLobbies(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      SNAKE_LOBBY_COLLECTION,
      [Query.limit(100)]
    );

    // 🟡 WAITING LOBBIES
    const waiting = res.documents.filter(
      (m) =>
        m.status === "waiting" &&
        !m.opponentId &&
        m.hostId !== userId
    );

    // 🔥 ACTIVE LOBBIES (FIXED)
    const active = res.documents.filter(
      (m) =>
        m.status === "matched" &&
        (m.hostId === userId || m.opponentId === userId)
    );

    setMatches(waiting);
    setActiveMatches(active);
  }

  // =========================
  // CREATE LOBBY
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount < 150) {
      return alert("Minimum stake is ₦150");
    }

    if (!wallet || wallet.balance < amount) {
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
      loadLobbies(user.$id);
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

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - fresh.stake
        }
      );

      const total = fresh.stake * 2;
      const adminCut = Math.floor((total * ADMIN_CUT_PERCENT) / 100);
      const finalPot = total - adminCut;

      const game = await createGame(fresh, user.$id, finalPot);

      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          gameId: game.$id,
          pot: finalPot
        }
      );

      // admin payout
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

      {/* WAITING */}
      <h3>🟡 Waiting Lobbies</h3>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>₦{m.stake}</p>

          <button onClick={() => joinMatch(m)}>
            Join
          </button>
        </div>
      ))}

      {/* ACTIVE */}
      <h3>🔥 Active Games</h3>

      {activeMatches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <div>
            <p>₦{m.stake}</p>
            <p>Status: {m.status}</p>
          </div>

          {/* ✅ ALWAYS SHOW RESUME IF MATCHED */}
          {m.status === "matched" && m.gameId && (
            <button
              style={styles.resumeBtn}
              onClick={() => goGame(m.gameId, m.stake)}
            >
              ▶ Resume Game
            </button>
          )}
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
  },

  resumeBtn: {
    background: "#16a34a",
    padding: "10px 20px",
    borderRadius: 10,
    border: "none",
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer"
  }
};