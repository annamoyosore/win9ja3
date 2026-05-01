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

// 🔊 ADVANCED SOUND
function playSound(type) {
  switch (type) {
    case "invalid":
      beep(120, 200);
      break;
    case "pick2":
      beep(500, 120);
      setTimeout(() => beep(700, 120), 120);
      break;
    case "suspension":
      beep(300, 200);
      break;
    case "holdon":
      beep(600, 100);
      setTimeout(() => beep(600, 100), 120);
      break;
    case "market":
      beep(800, 150);
      break;
    case "draw":
      beep(250, 120);
      break;
    default:
      beep();
  }
}

// =========================
// 🎴 CARD EFFECT
// =========================
function getCardEffect(n) {
  switch (n) {
    case 2: return { text: "🔥 PICK 2", sound: "pick2" };
    case 8: return { text: "⛔ SUSPENSION", sound: "suspension" };
    case 1: return { text: "🔁 HOLD ON", sound: "holdon" };
    case 14: return { text: "🛒 MARKET", sound: "market" };
    default: return null;
  }
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
// PARSE / ENCODE
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
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
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
    history: g.history.slice(-30).join("||"),
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
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showWin, setShowWin] = useState(false);
  const [notice, setNotice] = useState("");

  const payoutRef = useRef(false);
  const actionLock = useRef(false);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      setGame(parseGame(g));

      if (g.matchId) {
        const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
        setMatch(m);
      }
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
            setTimeout(goHome, 3000);
          } else {
            setTimeout(goHome, 2500);
          }

          if (payoutRef.current) return;

          const freshGame = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            parsed.$id
          );

          if (freshGame.payoutDone) return;

          payoutRef.current = true;

          try {
            const freshMatch = parsed.matchId
              ? await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, parsed.matchId)
              : null;

            const total = Number(freshMatch?.pot || 0);

            const w = await databases.listDocuments(
              DATABASE_ID,
              WALLET_COLLECTION,
              [Query.equal("userId", parsed.winnerId)]
            );

            if (w.documents.length) {
              await databases.updateDocument(
                DATABASE_ID,
                WALLET_COLLECTION,
                w.documents[0].$id,
                {
                  balance: Number(w.documents[0].balance || 0) + total
                }
              );
            }

            for (let pid of parsed.players) {
              const wallets = await databases.listDocuments(
                DATABASE_ID,
                WALLET_COLLECTION,
                [Query.equal("userId", pid)]
              );

              if (wallets.documents.length) {
                await databases.updateDocument(
                  DATABASE_ID,
                  WALLET_COLLECTION,
                  wallets.documents[0].$id,
                  { locked: 0 }
                );
              }
            }

            await databases.updateDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              parsed.$id,
              { payoutDone: true }
            );

            if (parsed.matchId) {
              await databases.updateDocument(
                DATABASE_ID,
                MATCH_COLLECTION,
                parsed.matchId,
                { status: "finished" }
              );
            }

          } catch (e) {
            console.log("payout error", e);
          }
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const oppCards = game.hands[oppIdx].length;
  const top = decodeCard(game.discard);

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  async function playCard(i) {
    if (actionLock.current) return;
    if (game.status === "finished") return;
    if (game.turn !== userId) {
      playSound("invalid");
      return;
    }

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (g.pendingPick > 0 && current.number !== 2) {
      playSound("invalid");
      setNotice("Must play 2 or draw");
      setTimeout(() => setNotice(""), 1200);
      actionLock.current = false;
      return;
    }

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) {
      playSound("invalid");
      setNotice("Invalid move");
      setTimeout(() => setNotice(""), 1000);
      actionLock.current = false;
      return;
    }

    g.hands[myIdx].splice(i, 1);

    const effect = getCardEffect(current.number);

    g.history = [
      ...g.history.slice(-20),
      effect
        ? `👤 ${myName} → ${card} (${effect.text})`
        : `👤 ${myName} → ${card}`
    ];

    let nextTurn = g.players[oppIdx];

    if (effect) playSound(effect.sound);

    if (current.number === 2) g.pendingPick += 2;
    if ([1,8,14].includes(current.number)) nextTurn = userId;

    setGame({ ...g, discard: card, turn: nextTurn });

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      discard: card,
      turn: nextTurn
    });

    actionLock.current = false;
  }

  async function drawMarket() {
    if (actionLock.current) return;
    if (game.status === "finished") return;
    if (game.turn !== userId) return;

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));

    let count = g.pendingPick > 0 ? g.pendingPick : 1;

    for (let i = 0; i < count; i++) {
      if (!g.deck.length) break;
      g.hands[myIdx].push(g.deck.pop());
    }

    g.pendingPick = 0;
    g.history.push(`📦 DRAW ${count}`);

    playSound("draw");
    setNotice(`Drew ${count}`);
    setTimeout(() => setNotice(""), 1000);

    setGame({ ...g, turn: g.players[oppIdx] });

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      turn: g.players[oppIdx]
    });

    actionLock.current = false;
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        {notice && <div style={styles.notice}>{notice}</div>}

        {/* rest unchanged UI */}
      </div>
    </div>
  );
}

// =========================
// STYLES
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
  notice: {
    position: "fixed",
    top: "20%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#dc2626",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 8,
    fontWeight: "bold",
    zIndex: 999
  }
};