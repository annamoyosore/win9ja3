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
// 🔊 SOUND
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
// PARSER
// =========================
function parseGame(g) {
  const split = (v, s) =>
    typeof v === "string" ? v.split(s).filter(Boolean) : [];

  const players = Array.isArray(g.players)
    ? g.players
    : split(g.players, ",");

  const handsRaw = split(g.hands, "|");

  return {
    ...g,
    players,
    hands: handsRaw.length === 2
      ? handsRaw.map(p => split(p, ","))
      : [[], []],
    deck: split(g.deck, ","),
    history: split(g.history, "||"),
    scores: split(g.scores, ",").map(Number) || [0,0],
    round: Number(g.round || 1),
    pendingPick: Number(g.pendingPick || 0)
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard || "",
    turn: g.turn,
    pendingPick: String(g.pendingPick),
    history: (g.history || []).slice(0,10).join("||"),
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
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");

  const actionLock = useRef(false);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
      .then(g => setGame(parseGame(g)));

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => setGame(parseGame(res.payload))
    );

    return () => unsub();
  }, [gameId, userId]);

  // ✅ UNREAD
  useEffect(() => {
    if (!gameId || !userId) return;

    databases.listDocuments(
      DATABASE_ID,
      "messages",
      [
        Query.equal("gameId", gameId),
        Query.notEqual("sender", userId)
      ]
    ).then(res => setUnread(res.total));
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const oppCards = game.hands[oppIdx].length;

  async function playCard(i) {
    if (actionLock.current) return;
    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];

    g.hands[myIdx].splice(i,1);

    // ✅ HISTORY FIX
    g.history = [`You played ${card}`, ...(g.history || [])];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        discard: card,
        turn: g.players[oppIdx]
      }
    );

    actionLock.current = false;
  }

  async function drawMarket() {
    const g = JSON.parse(JSON.stringify(game));

    g.hands[myIdx].push(g.deck.pop());

    // ✅ HISTORY FIX
    g.history = [`You drew a card`, ...(g.history || [])];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        turn: g.players[oppIdx]
      }
    );
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>

        {/* HEADER */}
        <div style={styles.header}>
          <h2>🎮 WHOT GAME</h2>

          <button style={styles.chatBtn} onClick={() => openChat(gameId)}>
            💬 {unread > 0 && <span style={styles.badge}>{unread}</span>}
          </button>
        </div>

        <div style={styles.row}>
          <span>{oppCards} cards</span>
        </div>

        <div style={styles.hand}>
          {hand.map((c,i) => (
            <button key={i} onClick={()=>playCard(i)}>
              {c}
            </button>
          ))}
        </div>

        <button onClick={drawMarket}>Draw</button>

        {/* HISTORY */}
        <div style={styles.history}>
          {game.history?.map((h,i)=>(
            <div key={i}>{h}</div>
          ))}
        </div>

        <button onClick={goHome}>Exit</button>
      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  bg:{minHeight:"100vh",background:"green",display:"flex",justifyContent:"center",alignItems:"center"},
  box:{width:"95%",maxWidth:450,background:"#000000cc",padding:12,color:"#fff",borderRadius:10},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  row:{display:"flex",justifyContent:"space-between"},
  hand:{display:"flex",gap:6,flexWrap:"wrap"},
  chatBtn:{background:"#111",color:"#fff",padding:"6px 12px",borderRadius:8},
  badge:{background:"red",marginLeft:6,padding:"2px 6px",borderRadius:10},
  history:{marginTop:10,maxHeight:120,overflow:"auto",fontSize:12,color:"#ff4d4d"}
};