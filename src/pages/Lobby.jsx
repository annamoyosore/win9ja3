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

const ZANGI_LINK = "https://services.zangi.com/dl/conversation/";

// =========================
// 🎵 TURN SOUND
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
  } catch (err) {
    console.log("Sound failed");
  }
}

// =========================
// CREATE GAME
// =========================
async function createGame(match, opponentId) {
  return await databases.createDocument(
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

  // ✅ ZANGI MAP (SAFE)
  const [zangiMap, setZangiMap] = useState({});

  const notifiedTurns = useRef({});

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();

    if ("Notification" in window) {
      Notification.requestPermission();
    }

    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    await autoRefundExpiredMatches(u.$id);
    refresh(u.$id);
  }

  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => refresh(user.$id)
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await Promise.all([
      loadMatches(userId),
      loadActiveMatches(userId)
    ]);
  }

  // =========================
  // LOAD ZANGI CONTACTS (SAFE)
  // =========================
  async function loadZangiContacts(userIds) {
    if (!userIds.length) return;

    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.limit(100)]
      );

      const map = {};

      res.documents.forEach((w) => {
        if (userIds.includes(w.userId)) {
          map[w.userId] = w.zangiContact || "";
        }
      });

      setZangiMap(map);
    } catch (err) {
      console.log("Zangi load error", err);
    }
  }
async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    const available = res.documents.filter(
      (m) =>
        m.status === "waiting" &&
        !m.opponentId &&
        m.hostId !== userId
    );

    setMatches(available);
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
    const ids = [];

    await Promise.all(
      mine.map(async (m) => {
        if (m.gameId) {
          try {
            const g = await databases.getDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              m.gameId
            );
            map[m.gameId] = g;
          } catch {}
        }

        if (m.hostId) ids.push(m.hostId);
        if (m.opponentId) ids.push(m.opponentId);
      })
    );

    setGameMap(map);
    await loadZangiContacts([...new Set(ids)]);
  }

  // =========================
  // OPEN ZANGI CHAT
  // =========================
  function openZangi(opponentId) {
    const zangi = zangiMap[opponentId];

    if (!zangi) {
      return alert("Opponent has no Zangi contact yet.");
    }

    const msg = encodeURIComponent(
      "Hey! Let's chat on Zangi and continue our match."
    );

    window.open(`${ZANGI_LINK}${zangi}?text=${msg}`, "_blank");
  }

  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      <h2>🔥 Your Matches</h2>

      {activeMatches.map((m) => {
        const game = gameMap[m.gameId];

        const opponentId =
          m.hostId === user?.$id ? m.opponentId : m.hostId;

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
              {m.gameId && (
                <button
                  style={styles.resumeBtn}
                  onClick={() => goGame(m.gameId, m.stake)}
                >
                  ▶ Resume
                </button>
              )}

              {m.opponentId && (
                <button
                  style={styles.zangiBtn}
                  onClick={() => openZangi(opponentId)}
                >
                  💬 Chat
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
            style={styles.joinBtn}
            onClick={() => joinMatch(m)}
            disabled={loadingJoin === m.$id}
          >
            {loadingJoin === m.$id ? "Joining..." : "Join"}
          </button>
        </div>
      ))}

      <input
        type="number"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake ₦"
      />

      <button
        style={styles.createBtn}
        onClick={createMatch}
        disabled={creating}
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
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  joinBtn: {
    background: "gold",
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    fontWeight: "bold"
  },

  resumeBtn: {
    background: "#16a34a",
    color: "#fff",
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    fontWeight: "bold"
  },

  // 🔴 RED CREATE BUTTON (as requested earlier)
  createBtn: {
    background: "#dc2626",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    fontWeight: "bold",
    marginTop: 10
  },

  // 🔵 ZANGI CHAT BUTTON
  zangiBtn: {
    background: "#0ea5e9",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    fontWeight: "bold"
  }
};