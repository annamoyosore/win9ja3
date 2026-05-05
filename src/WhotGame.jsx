import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query,
  ID
} from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";

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
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
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

// 🎴 DRAW CARD
function drawCard(cardStr) {
  if (!cardStr) return null;

  const shape = cardStr[0];
  const number = Number(cardStr.slice(1));

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
  ctx.fillText(number, 6, 18);

  const cx = 35, cy = 55;

  if (shape === "c") { ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill(); }
  if (shape === "s") ctx.fillRect(cx - 12, cy - 12, 24, 24);
  if (shape === "t") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.fill();
  }
  if (shape === "r") ctx.fillText("★", cx - 8, cy + 8);
  if (shape === "x") {
    ctx.fillRect(cx - 3, cy - 12, 6, 24);
    ctx.fillRect(cx - 12, cy - 3, 24, 6);
  }

  return c.toDataURL();
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

// 🛠 PARSE
function parseGame(g) {
  const safe = (v, s) => typeof v === "string" ? v.split(s).filter(Boolean) : [];

  const players = Array.isArray(g.players) ? g.players : safe(g.players, ",");

  let hands = safe(g.hands, "|").map(p => p.split(",").filter(Boolean));
  if (hands.length !== 2) hands = [[], []];

  let deck = safe(g.deck, ",");

  if (!deck.length || !hands[0].length || !hands[1].length || !g.discard) {
    const d = createDeck();
    return {
      ...g,
      players,
      hands: [d.splice(0,6), d.splice(0,6)],
      deck: d,
      discard: d.pop(),
      turn: players[0],
      history: [],
      scores: [0,0],
      round: 1,
      status: "playing",
      pendingPick: 0,
      pot: Number(g.pot || 0),
      payoutDone: false
    };
  }

  return {
    ...g,
    players,
    hands,
    deck,
    discard: g.discard,
    turn: g.turn,
    history: safe(g.history, "||"),
    scores: safe(g.scores, ",").map(Number),
    round: Number(g.round || 1),
    status: g.status,
    pendingPick: Number(g.pendingPick || 0),
    pot: Number(g.pot || 0),
    payoutDone: Boolean(g.payoutDone),
    winnerId: g.winnerId || null
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    turn: g.turn,
    history: g.history.slice(-20).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status,
    pendingPick: String(g.pendingPick),
    pot: g.pot,
    payoutDone: g.payoutDone,
    winnerId: g.winnerId
  };
}

export default function WhotGame({ gameId, goHome, openChat }) {

  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const [showWinPopup, setShowWinPopup] = useState(false);

  const lock = useRef(false);
  const clearedRef = useRef(false);
const name = (i) => i === 0 ? "Player 1" : "Player 2";
useEffect(() => {
    account.get().then(u => setUserId(u.$id)).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      setGame(parseGame(g));
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => setGame(parseGame(res.payload))
    );

    return () => unsub();
  }, [gameId, userId]);

  // 💬 unread
  useEffect(() => {
    if (!gameId || !userId) return;

    const fetchUnread = async () => {
      const res = await databases.listDocuments(
        DATABASE_ID,
        "messages",
        [Query.equal("gameId", gameId), Query.notEqual("sender", userId)]
      );
      setUnread(res.total || 0);
    };

    fetchUnread();
  }, [gameId, userId]);

  async function endRound(g, winner) {
    g.scores[winner]++;

    if (g.scores[winner] === 2) {
      g.status = "finished";
      g.winnerId = g.players[winner];

      await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, encodeGame(g));
      return;
    }

    const d = createDeck();
    g.hands = [d.splice(0,6), d.splice(0,6)];
    g.discard = d.pop();
    g.deck = d;
    g.round++;

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, encodeGame(g));
  }

  async function playCard(i) {
    if (lock.current || game.turn !== userId) return;
    lock.current = true;

    try {
      const g = JSON.parse(JSON.stringify(game));
      const card = g.hands[game.players.indexOf(userId)][i];
      const top = g.discard;

      if (g.pendingPick > 0 && card.slice(1) !== "2" && card.slice(1) !== "14") {
        setError("❌ Must respond to pick");
        lock.current = false;
        return;
      }

      if (
        card[0] !== top[0] &&
        card.slice(1) !== top.slice(1) &&
        card.slice(1) !== "14"
      ) {
        setError("❌ Invalid move");
        lock.current = false;
        return;
      }

      const myIdx = g.players.indexOf(userId);
      const oppIdx = myIdx === 0 ? 1 : 0;

      g.hands[myIdx].splice(i,1);

      let next = g.players[oppIdx];
      const num = card.slice(1);

      if (num === "1") next = g.players[myIdx];
      if (num === "2") g.pendingPick += 2;
      if (num === "8") next = g.players[myIdx];
      if (num === "14") g.pendingPick += 1;

      if (!g.hands[myIdx].length) {
        await endRound(g, myIdx);
        lock.current = false;
        return;
      }

      setGame({ ...g, discard: card, turn: next });

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        { ...encodeGame(g), discard: card, turn: next }
      );

    } catch {}

    lock.current = false;
  }

  async function draw() {
    if (lock.current || game.turn !== userId) return;
    lock.current = true;

    try {
      const g = JSON.parse(JSON.stringify(game));
      const myIdx = g.players.indexOf(userId);
      const oppIdx = myIdx === 0 ? 1 : 0;

      if (!g.deck.length) {
        const win = g.hands[0].length <= g.hands[1].length ? 0 : 1;
        await endRound(g, win);
        lock.current = false;
        return;
      }

      const picks = g.pendingPick > 0 ? g.pendingPick : 1;

      for (let i = 0; i < picks; i++) {
        if (g.deck.length) g.hands[myIdx].push(g.deck.pop());
      }

      g.pendingPick = 0;

      const next = g.players[oppIdx];

      setGame({ ...g, turn: next });

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        { ...encodeGame(g), turn: next }
      );

    } catch {}

    lock.current = false;
 }
if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const isWinner = game.winnerId === userId;

  return (
    <div style={styles.bg}>
      <div style={styles.box}>

        <h2>🎮 WHOT GAME</h2>

        <div style={styles.messageBar} onClick={() => openChat(gameId)}>
          💬 Messages {unread > 0 && <span style={styles.badge}>{unread}</span>}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <p>{game.turn === userId ? "🟢 YOUR TURN" : "⏳ OPPONENT"}</p>

        <div style={styles.row}>
          <span>Round {game.round}</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        <div style={styles.center}>
          {game.discard && <img src={drawCard(game.discard)} style={styles.card} />}
          <button onClick={draw}>🃏 {game.deck.length}</button>
        </div>

        <div style={styles.hand}>
          {game.hands[myIdx].map((c,i)=>(
            <img key={i} src={drawCard(c)} style={styles.card} onClick={()=>playCard(i)} />
          ))}
        </div>

        {/* 🎉 POPUP */}
        {game.status === "finished" && (
          <div style={styles.winOverlay}>
            <div style={styles.winBox}>
              <h2>{isWinner ? "🎉 YOU WON" : "💀 YOU LOST"}</h2>
              <p>{isWinner ? `+₦${game.pot}` : `-₦${game.pot}`}</p>
              <p>Redirecting {countdown}s</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  bg:{minHeight:"100vh",background:"green",display:"flex",justifyContent:"center",alignItems:"center"},
  box:{width:"95%",maxWidth:450,background:"#000",padding:12,color:"#fff",borderRadius:10},
  row:{display:"flex",justifyContent:"space-between"},
  hand:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"},
  card:{width:65,cursor:"pointer"},
  center:{display:"flex",justifyContent:"center",gap:10},
  messageBar:{background:"#111",padding:8,marginBottom:8,cursor:"pointer"},
  badge:{background:"red",padding:"2px 6px",borderRadius:8},
  error:{color:"red",textAlign:"center"},
  winOverlay:{position:"absolute",top:0,left:0,width:"100%",height:"100%",background:"#000a",display:"flex",justifyContent:"center",alignItems:"center"},
  winBox:{background:"#111",padding:20,borderRadius:10}
};