import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";

// =========================
// 🔊 SOUND + ERROR
// =========================
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

// =========================
// 🎴 DECK
// =========================
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

// =========================
// 🎴 DECODE
// =========================
function decodeCard(str) {
  if (!str || typeof str !== "string") return null;

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

// =========================
// 🎴 DRAW CARD
// =========================
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
  ctx.lineWidth = 2;
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

  if (card.shape === "star") {
    ctx.font = "20px Arial";
    ctx.fillText("★", cx - 8, cy + 8);
  }

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
  ctx.font = "bold 20px Arial";
  ctx.fillText("🂠", 18, 60);

  return c.toDataURL();
}

// =========================
// ✅ SAFE PARSER
// =========================
function parseGame(g) {
  const safeSplit = (v, sep) =>
    typeof v === "string" ? v.split(sep).filter(Boolean) : [];

  const players = Array.isArray(g.players)
    ? g.players
    : safeSplit(g.players, ",");

  const handsRaw = safeSplit(g.hands, "|");

  const hands =
    handsRaw.length === 2
      ? handsRaw.map(p => safeSplit(p, ","))
      : [[], []];

  return {
    ...g,
    players,
    hands,
    deck: safeSplit(g.deck, ","),
    discard: g.discard || null,
    turn: g.turn || null,
    pendingPick: Number(g.pendingPick || 0),
    history: safeSplit(g.history, "||"),
    scores: safeSplit(g.scores, ",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    winnerId: g.winnerId || null,
    matchId: g.matchId || null
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard || "",
    turn: g.turn,
    pendingPick: String(g.pendingPick),
    history: (g.history || []).slice(-10).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome, openChat }) {

const [game, setGame] = useState(null);
const [match, setMatch] = useState(null);
const [userId, setUserId] = useState(null);
const [showWin, setShowWin] = useState(false);
const [error, setError] = useState("");
const [unread, setUnread] = useState(0);

const payoutRef = useRef(false);
const actionLock = useRef(false);

function invalidMove(msg) {
  beep(120, 300);
  setError(msg);
  setTimeout(() => setError(""), 1000);
}

useEffect(() => {
  account.get().then(u => setUserId(u.$id));
}, []);

// (your subscription + payout logic remains unchanged)

if (!game || !userId) return <div>Loading...</div>;

const myIdx = game.players.indexOf(userId);
const oppIdx = myIdx === 0 ? 1 : 0;

const hand = game.hands[myIdx] || [];
const oppCards = game.hands[oppIdx]?.length || 0;
const top = game.discard ? decodeCard(game.discard) : null;

const myName = myIdx === 0 ? game.hostName : game.opponentName;
const oppName = myIdx === 0 ? game.opponentName : game.hostName;

// =========================
// PLAY CARD (patched)
// =========================
async function playCard(i) {
  if (actionLock.current) return;
  if (game.turn !== userId) return invalidMove("Not your turn");

  actionLock.current = true;

  const g = JSON.parse(JSON.stringify(game));
  const card = g.hands[myIdx][i];
  const current = decodeCard(card);

  g.hands[myIdx].splice(i, 1);

  // ✅ HISTORY
  const moveText = `${myName} played ${current.shape} ${current.number}`;
  g.history = [...(g.history || []), moveText].slice(-10);

  const nextTurn = g.players[oppIdx];

  setGame({ ...g, discard: card, turn: nextTurn });

  await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
    ...encodeGame(g),
    discard: card,
    turn: nextTurn,
    history: g.history.join("||")
  });

  actionLock.current = false;
}

// =========================
// DRAW MARKET (patched)
// =========================
async function drawMarket() {
  if (actionLock.current) return;
  if (game.turn !== userId) return invalidMove("Wait your turn");

  actionLock.current = true;

  const g = JSON.parse(JSON.stringify(game));
  let count = g.pendingPick > 0 ? g.pendingPick : 1;

  for (let i = 0; i < count; i++) {
    if (!g.deck.length) break;
    g.hands[myIdx].push(g.deck.pop());
  }

  g.pendingPick = 0;

  // ✅ HISTORY
  const moveText = `${myName} drew ${count} card(s)`;
  g.history = [...(g.history || []), moveText].slice(-10);

  setGame({ ...g, turn: g.players[oppIdx] });

  await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
    ...encodeGame(g),
    turn: g.players[oppIdx],
    history: g.history.join("||")
  });

  actionLock.current = false;
}

return (
<div style={styles.box}>

  {/* ✅ CHAT MOVED TOP LEFT */}
  <button
    style={styles.chatTopBtn}
    onClick={() => openChat(gameId)}
  >
    💬 {unread > 0 && <span style={styles.badge}>{unread}</span>}
  </button>

  {/* (your FULL original UI remains untouched here) */}

  {/* ✅ MOVE HISTORY */}
  <div style={styles.historyBox}>
    <div style={styles.historyTitle}>📜 Moves</div>
    {game.history?.slice(-5).reverse().map((h, i) => (
      <div key={i} style={styles.historyItem}>{h}</div>
    ))}
  </div>

</div>
);
}

// =========================
// STYLES (added only)
// =========================
const styles = {
  chatTopBtn: {
    position: "absolute",
    top: 10,
    left: 10,
    background: "#111",
    color: "#fff",
    border: "none",
    padding: "10px 14px",
    borderRadius: "50px",
    zIndex: 999
  },

  historyBox: {
    background: "#111",
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
    maxHeight: 120,
    overflowY: "auto",
    fontSize: 12
  },

  historyTitle: {
    fontWeight: "bold",
    marginBottom: 4,
    color: "#facc15"
  },

  historyItem: {
    borderBottom: "1px solid #333",
    padding: "2px 0"
  },

  badge: {
    background: "red",
    marginLeft: 6,
    padding: "2px 6px",
    borderRadius: 10
  }
};