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

// =========================
// 🎵 TURN SOUND (UNCHANGED)
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
  } catch (err) {}
}

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
  const [walletMap, setWalletMap] = useState({}); // 🆕 Zangi + opponent data

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

    refresh(u.$id);
  }

  // =========================
  // LOAD DATA
  // =========================
  async function refresh(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    const mine = res.documents.filter(
      (m) => m.hostId === userId || m.opponentId === userId
    );

    setActiveMatches(mine);

    const map = {};
    const wmap = {};

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

        // =========================
        // FETCH OPPONENT WALLET (ZANGI)
        // =========================
        const opponentId =
          m.hostId === userId ? m.opponentId : m.hostId;

        if (opponentId) {
          try {
            const ow = await databases.listDocuments(
              DATABASE_ID,
              WALLET_COLLECTION,
              [Query.equal("userId", opponentId), Query.limit(1)]
            );

            if (ow.documents.length) {
              wmap[opponentId] = ow.documents[0];
            }
          } catch {}
        }
      })
    );

    setGameMap(map);
    setWalletMap(wmap);
  }

  // =========================
  // TURN INDICATOR (UNCHANGED)
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
      } else {
        notifiedTurns.current[m.gameId] = false;
      }
    });
  }, [activeMatches, gameMap, user]);

  // =========================
  // 💬 ZANGI CHAT
  // =========================
  function openZangiChat(opponentId) {
    const opp = walletMap[opponentId];

    const number = opp?.zangiContact;

    const message =
      "Hey! Let’s chat securely on Zangi Messenger. " +
      "Let’s connect and finish the game if you're away. " +
      "Download Zangi → https://services.zangi.com/dl/conversation/";

    if (!number) {
      alert("Opponent has no Zangi contact set");
      return;
    }

    const url =
      `https://services.zangi.com/dl/conversation/?phone=${number}&text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      {/* ACTIVE COUNT (UNCHANGED) */}
      <p>
        Running Matches:{" "}
        {activeMatches.filter((m) => m.status !== "finished").length} / 7
      </p>

      <h2>🔥 Your Matches</h2>

      {activeMatches.map((m) => {
        const game = gameMap[m.gameId];

        const opponentId =
          m.hostId === user.$id ? m.opponentId : m.hostId;

        let turnLabel = "";
        if (game && game.status !== "finished") {
          turnLabel =
            game.turn === user.$id
              ? "🟢 Your Turn"
              : "🔴 Opponent Turn";
        }

        const oppWallet = walletMap[opponentId];

        return (
          <div key={m.$id} style={styles.card}>
            <div>
              <p>₦{m.stake}</p>
              <p>{m.status}</p>
              {turnLabel && <p>{turnLabel}</p>}

              {/* 🆕 ZANGI DISPLAY */}
              {oppWallet?.zangiContact && (
                <p style={{ fontSize: 12, color: "#9ca3af" }}>
                  Zangi: {oppWallet.zangiContact}
                </p>
              )}
            </div>

            {/* CHAT BUTTON */}
            {opponentId && (
              <button
                style={styles.chatBtn}
                onClick={() => openZangiChat(opponentId)}
              >
                💬 Chat
              </button>
            )}

            {m.status === "finished" ? (
              <button style={styles.finishedBtn} disabled>
                ✅ Finished
              </button>
            ) : m.gameId ? (
              <button
                style={styles.resumeBtn}
                onClick={() => goGame(m.gameId, m.stake)}
              >
                ▶ Resume
              </button>
            ) : null}
          </div>
        );
      })}

      <button onClick={back}>Back</button>
    </div>
  );
}

// =========================
// STYLES (UNCHANGED + ADD CHAT)
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

  chatBtn: {
    background: "#3b82f6",
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer",
    marginRight: 8
  },

  resumeBtn: {
    background: "#16a34a",
    padding: "10px 20px",
    borderRadius: 12,
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer"
  },

  finishedBtn: {
    background: "#16a34a",
    padding: "10px 18px",
    borderRadius: 10,
    color: "#fff",
    border: "none",
    fontWeight: "bold"
  }
};