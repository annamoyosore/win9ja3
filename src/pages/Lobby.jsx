import { useEffect, useRef, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

const GAME_COLLECTION = "games";
const ADMIN_ID = "69ef9fe863a02a7490b4";

const ZANGI_BASE = "https://services.zangi.com/dl/conversation/";

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
async function createGame(match, opponentId) {
  return databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: `${match.hostId},${opponentId}`,
      status: "running",
      turn: match.hostId,
      payoutDone: false
    }
  );
}

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});
  const [stake, setStake] = useState("");

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  // 🔔 turn tracker
  const notifiedTurns = useRef({});

  // 🟢 NEW: opponent zangi map
  const [zangiMap, setZangiMap] = useState({});

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      if ("Notification" in window) {
        Notification.requestPermission();
      }

      const w = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id), Query.limit(1)]
      );

      if (w.documents.length) setWallet(w.documents[0]);

      await refresh(u.$id);
    } catch (e) {
      console.log("Init failed", e);
    }
  }

  async function refresh(userId) {
    await Promise.all([
      loadMatches(userId),
      loadActiveMatches(userId),
      loadOpponentZangi(userId)
    ]);
  }
async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    setMatches(
      res.documents.filter(
        (m) => m.status === "waiting" && !m.opponentId && m.hostId !== userId
      )
    );
  }

  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100), Query.orderDesc("$createdAt")]
    );

    const mine = res.documents.filter(
      (m) => m.hostId === userId || m.opponentId === userId
    );

    setActiveMatches(mine);

    const map = {};

    await Promise.all(
      mine.map(async (m) => {
        if (!m.gameId) return;

        try {
          const g = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            m.gameId
          );
          map[m.gameId] = g;
        } catch {}
      })
    );

    setGameMap(map);
  }

  // =========================
  // NEW: load opponent zangi only
  // =========================
  async function loadOpponentZangi(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [Query.limit(100)]
      );

      const opponentIds = [];

      res.documents.forEach((m) => {
        if (m.hostId === userId && m.opponentId) {
          opponentIds.push(m.opponentId);
        }
        if (m.opponentId === userId) {
          opponentIds.push(m.hostId);
        }
      });

      if (!opponentIds.length) return;

      const wallets = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.limit(100)]
      );

      const map = {};

      wallets.documents.forEach((w) => {
        if (opponentIds.includes(w.userId)) {
          map[w.userId] = w.zangiContact || "";
        }
      });

      setZangiMap(map);
    } catch (err) {
      console.log("Zangi load failed", err);
    }
  }

  // =========================
  // CHAT ZANGI
  // =========================
  function openZangi(opponentId) {
    const contact = zangiMap[opponentId];

    if (!contact) return;

    const msg = encodeURIComponent(
      "Hey! Let’s chat securely on Zangi and complete our game."
    );

    window.open(`${ZANGI_BASE}${contact}?text=${msg}`, "_blank");
  }
return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      <h2>🔥 Your Matches</h2>

      {activeMatches.map((m) => {
        const game = gameMap[m.gameId];

        const opponentId =
          m.hostId === user?.$id ? m.opponentId : m.hostId;

        const canChat = !!zangiMap[opponentId];

        return (
          <div key={m.$id} style={styles.card}>
            <div>
              <p>₦{m.stake}</p>
              <p>{m.status}</p>

              {game && (
                <p>
                  {game.turn === user?.$id
                    ? "🟢 Your Turn"
                    : "🔴 Opponent Turn"}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {canChat && (
                <button
                  style={styles.chatBtn}
                  onClick={() => openZangi(opponentId)}
                >
                  💬 Chat
                </button>
              )}

              {m.gameId && (
                <button
                  style={styles.resumeBtn}
                  onClick={() => goGame(m.gameId, m.stake)}
                >
                  ▶ Play
                </button>
              )}
            </div>
          </div>
        );
      })}

      <h2>🎯 Available</h2>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button
            onClick={() => joinMatch(m)}
            style={styles.joinBtn}
          >
            Join
          </button>
        </div>
      ))}

      <input
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake ₦"
      />

      {/* 🔴 CREATE BUTTON (RED AS REQUESTED) */}
      <button
        onClick={createMatch}
        disabled={creating}
        style={styles.createBtn}
      >
        {creating ? "Creating..." : "Create Match"}
      </button>

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
    background: "#020617",
    color: "#fff",
    minHeight: "100vh"
  },

  card: {
    background: "#111827",
    padding: 12,
    margin: "10px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 12
  },

  joinBtn: {
    background: "gold",
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    fontWeight: "bold"
  },

  resumeBtn: {
    background: "#16a34a",
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    color: "#fff"
  },

  chatBtn: {
    background: "#2563eb",
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    color: "#fff"
  },

  // 🔴 requested red create button
  createBtn: {
    background: "#dc2626",
    padding: "12px 18px",
    borderRadius: 12,
    border: "none",
    color: "#fff",
    fontWeight: "bold",
    marginTop: 10
  }
};