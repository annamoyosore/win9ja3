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
// 🎵 SOUND
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
  } catch {
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
// =========================
  // TURN ALERT
  // =========================
  useEffect(() => {
    if (!user) return;

    activeMatches.forEach((m) => {
      const game = gameMap[m.gameId];
      if (!game || game.status === "finished") return;

      if (game.turn === user.$id) {
        if (notifiedTurns.current[m.gameId]) return;

        notifiedTurns.current[m.gameId] = true;

        playTurnSound();

        if (navigator.vibrate) {
          navigator.vibrate([300, 120, 300]);
        }

        if (
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("🎮 Win9ja", {
            body: "It's your turn!",
            icon: "/icon192.png"
          });
        }
      } else {
        notifiedTurns.current[m.gameId] = false;
      }
    });
  }, [activeMatches, gameMap, user]);

  async function refresh(userId) {
    await Promise.all([loadMatches(userId), loadActiveMatches(userId)]);
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
    await loadWalletZangi([...new Set(ids)]);
  }

  async function loadWalletZangi(userIds) {
    if (!userIds.length) return;

    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userIds)]
    );

    const map = {};
    res.documents.forEach((w) => {
      map[w.userId] = w.zangi || "";
    });

    setZangiMap(map);
  }

  function openZangi(userId) {
    const contact = zangiMap[userId];
    if (!contact) return alert("No Zangi contact found");

    window.open(`${ZANGI_LINK}${contact}`, "_blank");
  }

  function canPlayMore() {
    return activeMatches.filter((m) => m.status !== "finished").length < 7;
  }
return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      <h2>Your Matches</h2>

      {activeMatches.map((m) => {
        const game = gameMap[m.gameId];

        let turnLabel = null;
        let color = "#999";

        if (game && game.status !== "finished") {
          if (game.turn === user?.$id) {
            turnLabel = "Your Turn";
            color = "#22c55e"; // GREEN
          } else {
            turnLabel = "Opponent Turn";
            color = "#ef4444"; // RED
          }
        }

        const opponent =
          m.hostId === user?.$id ? m.opponentId : m.hostId;

        return (
          <div key={m.$id} style={styles.card}>
            <div>
              <p>₦{m.stake}</p>
              <p>{m.status}</p>

              {turnLabel && (
                <p style={{ color, fontWeight: "bold" }}>
                  {turnLabel}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {opponent && (
                <button
                  style={styles.chatBtn}
                  onClick={() => openZangi(opponent)}
                >
                  💬 Chat
                </button>
              )}

              {m.gameId && (
                <button
                  style={styles.resumeBtn}
                  onClick={() => goGame(m.gameId, m.stake)}
                >
                  ▶ Resume
                </button>
              )}
            </div>
          </div>
        );
      })}

      <h2>Available</h2>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button
            onClick={() => joinMatch(m)}
            style={styles.joinBtn}
            disabled={loadingJoin === m.$id}
          >
            Join
          </button>
        </div>
      ))}

      <input
        type="number"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake ₦"
      />

      {/* 🔴 CREATE BUTTON FIXED */}
      <button onClick={createMatch} style={styles.createBtn}>
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
    borderRadius: 12
  },
  joinBtn: {
    background: "gold",
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    fontWeight: "bold"
  },
  resumeBtn: {
    background: "#16a34a",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 10,
    border: "none"
  },
  chatBtn: {
    background: "#0ea5e9",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 10,
    border: "none"
  },
  createBtn: {
    background: "red",
    color: "#fff",
    padding: "12px 18px",
    borderRadius: 10,
    border: "none",
    fontWeight: "bold",
    marginTop: 10
  }
};