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
// 🎴 DRAW
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
// 🔥 FIXED PARSER (OLD + NEW)
// =========================
function parseGame(g) {
  const players =
    typeof g.players === "string"
      ? g.players.split(",")
      : g.players || [];

  let hands;
  if (typeof g.hands === "string") {
    hands = g.hands.split("|").map(p =>
      p ? p.split(",").filter(Boolean) : []
    );
  } else {
    hands = g.hands || [];
  }

  if (hands.length < 2) hands = [[], []];

  let deck =
    typeof g.deck === "string"
      ? g.deck.split(",").filter(Boolean)
      : g.deck || [];

  // 🔥 RECOVERY FOR OLD BROKEN GAMES
  if (!deck.length || !g.discard) {
    const newDeck = createDeck();
    hands = [newDeck.splice(0, 6), newDeck.splice(0, 6)];
    return {
      ...g,
      players,
      hands,
      deck: newDeck,
      discard: newDeck.pop(),
      turn: players[0],
      pendingPick: 0,
      history: [],
      scores: [0, 0],
      round: 1,
      status: "playing"
    };
  }

  return {
    ...g,
    players,
    hands,
    deck,
    discard: g.discard,
    turn: g.turn,
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||") : [],
    scores: g.scores?.split(",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    winnerId: g.winnerId || null,
    matchId: g.matchId || null,
    pot: Number(g.pot || 0)
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    turn: g.turn,
    pendingPick: String(g.pendingPick),
    history: g.history.slice(-10).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showWin, setShowWin] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      setGame(parseGame(g));
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      async (res) => {
        const parsed = parseGame(res.payload);
        setGame(parsed);

        if (parsed.status === "finished") {
          if (parsed.winnerId === userId) {
            setShowWin(true);
          }

          setTimeout(goHome, 3000);

          // payout
          if (parsed.winnerId !== userId) return;
          if (payoutRef.current) return;
          payoutRef.current = true;

          const fresh = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            parsed.$id
          );

          if (fresh.payoutDone) return;

          const pot = Number(fresh.pot || 0);

          await databases.updateDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            parsed.$id,
            { payoutDone: true, pot: 0 }
          );

          const wallet = await databases.listDocuments(
            DATABASE_ID,
            WALLET_COLLECTION,
            [Query.equal("userId", parsed.winnerId)]
          );

          if (wallet.documents.length) {
            const w = wallet.documents[0];
            await databases.updateDocument(
              DATABASE_ID,
              WALLET_COLLECTION,
              w.$id,
              { balance: Number(w.balance) + pot }
            );
          }
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  if (myIdx === -1) return <div>Invalid Game</div>;

  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;
  const top = decodeCard(game.discard);

  return (
    <div style={{ padding: 20, color: "#fff", background: "green", minHeight: "100vh" }}>

      <h2>WHOT GAME</h2>

      <div>Round {game.round}/3</div>
      <div>Score {game.scores[0]} - {game.scores[1]}</div>

      <div>🏦 ₦{game.pot}</div>

      <div style={{ margin: 10 }}>
        {Array.from({ length: oppCards }).map((_, i) => (
          <img key={i} src={drawBack()} width={40} />
        ))}
      </div>

      <div>
        {top && <img src={drawCard(top)} width={70} />}
      </div>

      <button onClick={() => {}}>Deck {game.deck.length}</button>

      <div>
        {hand.map((c, i) => (
          <img
            key={i}
            src={drawCard(decodeCard(c))}
            width={65}
          />
        ))}
      </div>

      {showWin && <div>🎉 YOU WON ₦{game.pot}</div>}

      <button onClick={goHome}>Exit</button>

    </div>
  );
}