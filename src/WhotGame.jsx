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

// 🎴 DECODE
function decodeCard(str) {
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

// 🎴 DRAW
const cache = new Map();

function drawCard(card) {
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

// 🧠 INIT GAME
function initGame(players, pot = 0) {
  const deck = createDeck();

  return {
    players,
    hands: [deck.splice(0, 6), deck.splice(0, 6)],
    deck,
    discard: deck.pop(),
    turn: players[0],
    history: [],
    scores: [0, 0],
    round: 1,
    status: "playing",
    pot
  };
}

// 👤 PLAYER NAME
function getPlayerName(id, players) {
  if (id === players[0]) return "Player 1";
  if (id === players[1]) return "Player 2";
  return "Player";
}
function parseGame(g) {
  const split = (v, s) => typeof v === "string" ? v.split(s).filter(Boolean) : [];

  const players = Array.isArray(g.players) ? g.players : split(g.players, ",");

  let hands = split(g.hands, "|").map(p => split(p, ","));
  let deck = split(g.deck, ",");

  if (!deck.length || !hands[0]?.length || !hands[1]?.length || !g.discard) {
    return { ...g, ...initGame(players, g.pot) };
  }

  return {
    ...g,
    players,
    hands,
    deck,
    discard: g.discard,
    turn: g.turn || players[0],
    history: split(g.history, "||"),
    scores: split(g.scores, ",").map(Number) || [0, 0],
    round: Number(g.round || 1)
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
    pot: g.pot
  };
}
export default function WhotGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");

  const lock = useRef(false);

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

    databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
      .then(g => setGame(parseGame(g)));

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => setGame(parseGame(res.payload))
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;

  async function playCard(i) {
    if (lock.current) return;
    if (game.turn !== userId) return invalid("Not your turn");

    lock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];

    if (
      card[0] !== g.discard[0] &&
      card.slice(1) !== g.discard.slice(1) &&
      card.slice(1) !== "14"
    ) {
      lock.current = false;
      return invalid("Invalid move");
    }

    g.hands[myIdx].splice(i, 1);

    const name = getPlayerName(userId, g.players);
    g.history = [...(g.history || []), `${name} ▶ ${card}`];

    if (!g.hands[myIdx].length) {
      g.scores[myIdx]++;
      g.round++;

      const deck = createDeck();
      g.hands = [deck.splice(0, 6), deck.splice(0, 6)];
      g.discard = deck.pop();
      g.deck = deck;
    }

    g.turn = g.players[oppIdx];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      encodeGame(g)
    );

    lock.current = false;
  }

  async function drawMarket() {
    if (lock.current) return;
    if (game.turn !== userId) return invalid("Wait turn");

    lock.current = true;

    const g = JSON.parse(JSON.stringify(game));

    if (!g.deck.length) {
      g.round++;
    } else {
      g.hands[myIdx].push(g.deck.pop());
    }

    const name = getPlayerName(userId, g.players);
    g.history = [...(g.history || []), `${name} ➕ picked`];

    g.turn = g.players[oppIdx];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      encodeGame(g)
    );

    lock.current = false;
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>

        <h2>🎮 WHOT GAME</h2>
        {error && <div style={styles.error}>{error}</div>}

        <div>Opponent Cards: {oppCards}</div>

        <div>
          {game.discard && (
            <img
              src={drawCard(decodeCard(game.discard))}
              style={styles.card}
            />
          )}
        </div>

        <button onClick={drawMarket}>
          Draw ({game.deck.length})
        </button>

        <div style={styles.history}>
          {(game.history || []).slice(-5).map((h, i) => (
            <div key={i}>{h}</div>
          ))}
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(decodeCard(c))}
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

const styles = {
  bg: { minHeight: "100vh", background: "#0b1a2a", display: "flex", justifyContent: "center", alignItems: "center" },
  box: { width: 350, background: "#000", padding: 10, color: "#fff" },
  hand: { display: "flex", gap: 6, flexWrap: "wrap" },
  card: { width: 60, cursor: "pointer" },
  history: { maxHeight: 80, overflow: "auto", fontSize: 12 },
  error: { background: "red", padding: 5 }
};