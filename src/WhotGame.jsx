import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

import Messages from "./Messages"; // ✅ CHAT

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";
const CHAT_COLLECTION = "messages"; // ✅ CHAT

// 🔊 SOUND
function beep(freq = 200, duration = 200) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "square";

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration / 1000
    );

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

function winSound() {
  beep(600, 200);
  setTimeout(() => beep(900, 200), 150);
}

// 🎴 DECK
function createDeck() {
  const valid = {
    c: [1,2,3,4,5,7,8,10,11,12,13,14],
    t: [1,2,3,4,5,7,8,10,11,12,13,14],
    s: [1,2,3,5,7,10,11,13,14],
    x: [1,2,3,5,7,10,11,13,14],
    r: [1,2,3,4,5,7,8]
  };

  let deck = [];
  Object.keys(valid).forEach(shape => {
    valid[shape].forEach(n => deck.push(shape + n));
  });

  return deck.sort(() => Math.random() - 0.5);
}

// 🎴 DECODE
function decodeCard(str) {
  if (!str) return null;

  const map = {
    c: "circle",
    t: "triangle",
    s: "square",
    r: "star",
    x: "cross"
  };

  return {
    shape: map[str[0]],
    number: Number(str.slice(1))
  };
}
const cache = new Map();

function drawCard(card) {
  if (!card) return null;

  const key = `${card.shape}_${card.number}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement("canvas");
  c.width = 70;
  c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 70, 100);

  ctx.strokeStyle = "#e11d48";
  ctx.strokeRect(2, 2, 66, 96);

  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 14px Arial";
  ctx.fillText(card.number, 6, 18);

  const cx = 35, cy = 55;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") ctx.fillRect(cx - 12, cy - 12, 24, 24);

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.fill();
  }

  if (card.shape === "star") ctx.fillText("★", cx - 8, cy + 8);

  if (card.shape === "cross") {
    ctx.fillRect(cx - 3, cy - 12, 6, 24);
    ctx.fillRect(cx - 12, cy - 3, 24, 6);
  }

  const img = c.toDataURL();
  cache.set(key, img);
  return img;
}

function drawBack() {
  const c = document.createElement("canvas");
  c.width = 65;
  c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 65, 100);

  ctx.strokeStyle = "#fff";
  ctx.strokeRect(2, 2, 61, 96);

  ctx.fillStyle = "#fff";
  ctx.fillText("🂠", 18, 60);

  return c.toDataURL();
}

function ensureGameReady(g) {
  if (g.status === "finished") return g;

  if (!g.deck?.length || !g.hands?.[0]?.length || !g.hands?.[1]?.length || !g.discard) {
    const deck = createDeck();
    return {
      ...g,
      hands: [deck.splice(0,6), deck.splice(0,6)],
      discard: deck.pop(),
      deck,
      pendingPick: 0,
      history: [],
      scores: [0,0],
      round: 1,
      status: "playing"
    };
  }
  return g;
}

function pushHistory(g, text) {
  return [...(g.history || []), text].slice(-10);
}
export default function WhotGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [showWin, setShowWin] = useState(false);

  // 💬 CHAT
  const [showChat, setShowChat] = useState(false);
  const [unread, setUnread] = useState(false);

  const payoutRef = useRef(false);
  const actionLock = useRef(false);

  function invalidMove(msg) {
    beep(120, 300);
    setError(msg);
    setTimeout(() => setError(""), 1200);
  }

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // 🔔 CHAT LISTENER (UNREAD)
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${CHAT_COLLECTION}.documents`,
      (res) => {
        if (res.payload.gameId !== gameId) return;

        // mark unread only if chat closed
        if (!showChat) {
          setUnread(true);
          beep(500, 120); // 🔔 notification
        }
      }
    );

    return () => unsub();
  }, [gameId, showChat]);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      const parsed = ensureGameReady(g);
      setGame(parsed);

      if (g.matchId) {
        const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
        setMatch(m);
      }
    };

    load();
if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;
  const top = decodeCard(game.discard);

  return (
    <div style={styles.bg}>
      <div style={styles.box}>

        {/* HEADER */}
        <div style={styles.header}>
          <span style={styles.title}>🎴 WHOT GAME</span>

          <div style={{ position: "relative" }}>
            <button
              style={styles.chatBtn}
              onClick={() => {
                setShowChat(true);
                setUnread(false);
              }}
            >
              💬
            </button>

            {unread && <span style={styles.dot}></span>}
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* GAME UI (UNCHANGED) */}
        <div style={styles.row}>
          <span>{game.hostName}</span>
          <span>VS</span>
          <span>{game.opponentName}</span>
        </div>

        <div style={{ textAlign: "center" }}>
          {Array.from({ length: oppCards }).map((_, i) => (
            <img key={i} src={drawBack()} style={{ width: 40 }} />
          ))}
        </div>

        <div style={styles.center}>
          {top && <img src={drawCard(top)} style={styles.card} />}
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(decodeCard(c))}
              style={styles.card}
            />
          ))}
        </div>

        <button onClick={goHome}>Exit</button>

        {/* 💬 CHAT MODAL */}
        {showChat && (
          <Messages
            gameId={gameId}
            onClose={() => setShowChat(false)}
          />
        )}

      </div>
    </div>
  );
}

const styles = {
  bg: { minHeight: "100vh", background: "green", display: "flex", justifyContent: "center", alignItems: "center" },
  box: { width: "95%", maxWidth: 450, background: "#000000cc", padding: 12, color: "#fff", borderRadius: 10 },

  header: { display: "flex", justifyContent: "space-between", marginBottom: 10 },
  title: { fontWeight: "bold" },

  chatBtn: {
    background: "#2563eb",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    color: "#fff"
  },

  dot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    background: "red",
    borderRadius: "50%"
  },

  row: { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  hand: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 10 },
  card: { width: 65 },
  center: { display: "flex", justifyContent: "center", marginTop: 10 },

  error: { background: "red", padding: 6, textAlign: "center", marginBottom: 6 }
};