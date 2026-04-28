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

const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// 🔊 SOUND
// =========================
function beep(freq = 400, duration = 120) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "square";

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
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
// CARD
// =========================
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
  ctx.font = "bold 12px Arial";
  ctx.fillText(card.number, 5, 15);

  const cx = 35, cy = 50;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") ctx.fillRect(cx - 10, cy - 10, 20, 20);

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx - 10, cy + 10);
    ctx.lineTo(cx + 10, cy + 10);
    ctx.fill();
  }

  if (card.shape === "star") ctx.fillText("★", cx - 6, cy + 5);

  if (card.shape === "cross") {
    ctx.fillRect(cx - 2, cy - 10, 4, 20);
    ctx.fillRect(cx - 10, cy - 2, 20, 4);
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
// PARSE
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players?.split(",") || [],
    deck: g.deck?.split(",").filter(Boolean) || [],
    hands: g.hands?.split("|").map(p => p.split(",").filter(Boolean)) || [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history?.split("||").filter(Boolean) || [],
    scores: g.scores?.split(",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2"
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick),
    history: g.history.slice(-20).join("||"),
    scores: g.scores.join(","),
    round: String(g.round)
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      const parsed = parseGame(g);

      if (!parsed.players.includes(userId)) return;

      setGame(parsed);

      if (g.matchId) {
        const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
        setMatch(m);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => setGame(parseGame(res.payload))
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId || game.players.length < 2) {
    return <div>Loading...</div>;
  }

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const oppCards = game.hands[oppIdx].length;

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  // =========================
  // UI ONLY (REST UNCHANGED)
  // =========================

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        {/* ✅ PLAYER NAMES */}
        <div style={styles.row}>
          <span>{myName}</span>
          <span>VS</span>
          <span>{oppName}</span>
        </div>

        {/* ✅ OPPONENT CARDS */}
        <div style={{ textAlign: "center" }}>
          {Array.from({ length: oppCards }).map((_, i) => (
            <img
              key={i}
              src={drawBack()}
              style={{
                width: 40,
                animation: oppCards === 1 ? "blink 0.6s infinite" : "none"
              }}
            />
          ))}
          <div>{oppName}: {oppCards} cards</div>
        </div>

        {/* ✅ POT */}
        <div style={styles.row}>
          <span>₦{match?.stake || 0}</span>
          <span>🏦 ₦{match?.pot || 0}</span>
        </div>

        <button onClick={goHome}>Exit</button>
      </div>

      <style>
        {`@keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0.2; }
          100% { opacity: 1; }
        }`}
      </style>
    </div>
  );
}

// =========================
// STYLES (UNCHANGED)
// =========================
const styles = {
  bg: {
    minHeight: "100vh",
    background: "green",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  box: {
    width: "95%",
    maxWidth: 450,
    background: "#000000cc",
    padding: 12,
    color: "#fff",
    borderRadius: 10
  },
  row: {
    display: "flex",
    justifyContent: "space-between"
  },
  hand: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 10
  },
  card: {
    width: 65,
    cursor: "pointer"
  },
  center: {
    display: "flex",
    justifyContent: "center",
    gap: 10
  }
};