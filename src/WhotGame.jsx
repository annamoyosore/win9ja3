import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

const GAME_COLLECTION = "games";

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

// 🎴 CREATE DECK (FIXED)
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

// 🎴 DRAW CARD (FIXED SHAPES)
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

  if (shape === "c") {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  if (shape === "s") ctx.fillRect(cx - 12, cy - 12, 24, 24);

  if (shape === "t") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.fill();
  }

  if (shape === "r") {
    ctx.font = "20px Arial";
    ctx.fillText("★", cx - 8, cy + 8);
  }

  if (shape === "x") {
    ctx.fillRect(cx - 3, cy - 12, 6, 24);
    ctx.fillRect(cx - 12, cy - 3, 24, 6);
  }

  return c.toDataURL();
}

// 🎴 BACK CARD
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
function parseGame(g) {
  const safe = (v, s) =>
    typeof v === "string" ? v.split(s).filter(Boolean) : [];

  let players = Array.isArray(g.players)
    ? g.players
    : safe(g.players, ",");

  // 🔥 prevent crash if not joined yet
  if (players.length < 2) {
    return {
      ...g,
      players,
      hands: [[], []],
      deck: [],
      discard: null,
      turn: null,
      history: [],
      scores: [0, 0],
      round: 1,
      status: "waiting",
      pendingPick: 0,
      pot: Number(g.pot || 0)
    };
  }

  let handsRaw = safe(g.hands, "|");
  let hands =
    handsRaw.length === 2
      ? handsRaw.map(p => safe(p, ","))
      : [[], []];

  let deck = safe(g.deck, ",");

  // 🔥 AUTO FIX BROKEN GAME
  if (!deck.length || !hands[0].length || !hands[1].length || !g.discard) {
    const d = createDeck();

    const p1 = d.splice(0, 6);
    const p2 = d.splice(0, 6);
    const discard = d.pop();

    return {
      ...g,
      players,
      hands: [p1, p2],
      deck: d,
      discard,
      turn: players[0],
      history: [],
      scores: [0, 0],
      round: 1,
      status: "playing",
      pendingPick: 0,
      pot: Number(g.pot || 0)
    };
  }

  return {
    ...g,
    players,
    hands,
    deck,
    discard: g.discard,
    turn: g.turn || players[0],
    history: safe(g.history, "||"),
    scores: safe(g.scores, ",").map(Number),
    round: Number(g.round || 1),
    status: g.status || "playing",
    pendingPick: Number(g.pendingPick || 0),
    pot: Number(g.pot || 0)
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    turn: g.turn,
    history: (g.history || []).slice(-20).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status,
    pendingPick: String(g.pendingPick || 0),
    pot: g.pot
  };
}
export default function WhotGame({ gameId, goHome, openChat }) {

  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);

  const lock = useRef(false);

  const name = (i) => (i === 0 ? "Player 1" : "Player 2");

  function invalid(msg) {
    beep();
    setError(msg);
    setTimeout(() => setError(""), 1000);
  }

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
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

  useEffect(() => {
    if (!gameId || !userId) return;

    databases.listDocuments(
      DATABASE_ID,
      "messages",
      [Query.equal("gameId", gameId), Query.notEqual("sender", userId)]
    ).then(res => setUnread(res.total || 0));
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;

  async function endRound(g, winner) {
    g = JSON.parse(JSON.stringify(g));
    g.scores[winner]++;

    if (g.round >= 3) {
      const final = g.scores[0] > g.scores[1] ? 0 : 1;

      await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
        ...encodeGame(g),
        status: "finished",
        winnerId: g.players[final]
      });
      return;
    }

    const d = createDeck();
    g.hands = [d.splice(0, 6), d.splice(0, 6)];
    g.discard = d.pop();
    g.deck = d;
    g.pendingPick = 0;
    g.round++;

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, encodeGame(g));
  }

  async function playCard(i) {
    if (lock.current) return;
    if (game.turn !== userId) return invalid("Not your turn");

    lock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];
    const top = g.discard;

    const valid =
      card[0] === top[0] ||
      card.slice(1) === top.slice(1) ||
      card.slice(1) === "14";

    if (!valid) {
      lock.current = false;
      return invalid("Invalid move");
    }

    g.hands[myIdx].splice(i, 1);
    g.history.push(`${name(myIdx)} played ${card}`);

    let next = g.players[oppIdx];

    if (["1", "8"].includes(card.slice(1))) next = userId;
    if (card.slice(1) === "2") g.pendingPick += 2;
    if (card.slice(1) === "14") g.pendingPick += 1;

    if (!g.hands[myIdx].length) {
      await endRound(g, myIdx);
      lock.current = false;
      return;
    }

    setGame({ ...g, discard: card, turn: next });

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      discard: card,
      turn: next
    });

    lock.current = false;
  }

  async function draw() {
    if (lock.current) return;
    if (game.turn !== userId) return invalid("Wait your turn");

    lock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    let count = g.pendingPick > 0 ? g.pendingPick : 1;

    for (let i = 0; i < count; i++) {
      if (!g.deck.length) break;
      g.hands[myIdx].push(g.deck.pop());
    }

    g.pendingPick = 0;
    g.history.push(`${name(myIdx)} picked ${count}`);

    const next = g.players[oppIdx];

    setGame({ ...g, turn: next });

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      turn: next
    });

    lock.current = false;
  }
return (
    <div style={styles.bg}>
      <div style={styles.box}>

        <button style={styles.chatBtn} onClick={() => openChat(gameId)}>
          💬 {unread > 0 && <span style={styles.badge}>{unread}</span>}
        </button>

        <h2>🎮 WHOT GAME</h2>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.row}>
          <span>Player 1</span>
          <span>VS</span>
          <span>Player 2</span>
        </div>

        <div style={{ textAlign: "center" }}>
          {Array.from({ length: oppCards }).map((_, i) => (
            <img key={i} src={drawBack()} style={{ width: 40 }} />
          ))}
          <div>Opponent: {oppCards}</div>
        </div>

        <p style={{ textAlign: "center" }}>
          {game.turn === userId ? "🟢 YOUR TURN" : "⏳ OPPONENT"}
        </p>

        <div style={styles.row}>
          <span>Round {game.round}/3</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        <div style={styles.row}>
          <span>🏦 ₦{game.pot}</span>
        </div>

        <div style={styles.center}>
          {game.discard && (
            <img src={drawCard(game.discard)} style={styles.card} />
          )}

          <button style={styles.marketBtn} onClick={draw}>
            🃏 {game.deck.length}
          </button>
        </div>

        <div style={styles.history}>
          {(game.history || []).slice(-5).map((h, i) => (
            <div key={i}>• {h}</div>
          ))}
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(c)}
              style={styles.card}
              onClick={() => playCard(i)}
            />
          ))}
        </div>

        <button onClick={goHome}>Exit</button>
      </div>
    </div>
  );
}

// 🎨 YOUR STYLE (UNCHANGED)
const styles = {
  bg:{minHeight:"100vh",background:"green",display:"flex",justifyContent:"center",alignItems:"center"},
  box:{width:"95%",maxWidth:450,background:"#000000cc",padding:12,color:"#fff",borderRadius:10,position:"relative"},
  row:{display:"flex",justifyContent:"space-between",marginBottom:6},
  hand:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginTop:10},
  card:{width:65,cursor:"pointer"},
  center:{display:"flex",justifyContent:"center",gap:10,marginTop:10},
  marketBtn:{background:"gold",padding:10,borderRadius:8,border:"none"},
  chatBtn:{position:"absolute",top:10,left:10,background:"#111",color:"#fff",border:"none",padding:"10px 14px",borderRadius:"50px"},
  badge:{background:"red",marginLeft:6,padding:"2px 6px",borderRadius:10,fontSize:12},
  history:{maxHeight:80,overflowY:"auto",fontSize:12,marginTop:8,background:"#111",padding:6,borderRadius:6},
  error:{background:"red",padding:6,textAlign:"center",marginBottom:6}
};