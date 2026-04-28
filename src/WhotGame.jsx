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
}

// 🔊 Last card alert
function lastCardSound() {
  beep(1000, 150);
  setTimeout(() => beep(1200, 150), 180);
}

// =========================
// 🎴 DECK
// =========================
function createDeck() {
  const shapes = ["c", "t", "s", "r", "x"];
  let deck = [];

  for (let s of shapes) {
    for (let i = 1; i <= 13; i++) {
      deck.push(s + i);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// CARD DECODE
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
// 🎨 CANVAS CARD
// =========================
const cache = new Map();

function drawCard(card) {
  if (!card) return null;

  const key = `${card.shape}_${card.number}`; // ✅ FIXED
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

// =========================
// BACK CARD (opponent)
// =========================
function drawBackCard() {
  const c = document.createElement("canvas");
  c.width = 70;
  c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 70, 100);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px Arial";
  ctx.fillText("🂠", 20, 60);

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
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    payoutDone: Boolean(g.payoutDone)
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
  const [countdown, setCountdown] = useState(0);

  const payoutRef = useRef(false);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      const parsed = parseGame(g);
      setGame(parsed);

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

        // 🎯 ROUND CHANGE → COUNTDOWN
        setCountdown(3);
        let t = 3;
        const timer = setInterval(() => {
          t--;
          setCountdown(t);
          if (t <= 0) clearInterval(timer);
        }, 1000);

        if (parsed.status === "finished" && !parsed.payoutDone && !payoutRef.current) {
          payoutRef.current = true;
          handlePayout(parsed);
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  async function handlePayout(g) {
    const total = Number(match?.pot || 0);
    const adminCut = total * 0.1;
    const winnerAmount = total - adminCut;

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", g.winnerId)]
    );

    if (w.documents.length) {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        w.documents[0].$id,
        { balance: Number(w.documents[0].balance || 0) + winnerAmount }
      );
    }

    const a = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", ADMIN_ID)]
    );

    if (a.documents.length) {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        a.documents[0].$id,
        { balance: Number(a.documents[0].balance || 0) + adminCut }
      );
    }

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      g.$id,
      { payoutDone: true }
    );
  }

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const oppHand = game.hands[oppIdx];

  const top = decodeCard(game.discard);

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  // 🔔 LAST CARD ALERT
  useEffect(() => {
    if (hand.length === 1) lastCardSound();
  }, [hand.length]);

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        <div style={styles.row}>
          <span>{myName}</span>
          <span>VS</span>
          <span>{oppName}</span>
        </div>

        <div style={styles.row}>
          <span>Round {game.round}</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        {/* 🂠 Opponent Cards */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <p>{oppName} Cards: {oppHand.length}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
            {oppHand.map((_, i) => (
              <img key={i} src={drawBackCard()} style={{ width: 30 }} />
            ))}
          </div>
        </div>

        <div style={styles.center}>
          {top && <img src={drawCard(top)} />}
        </div>

        {/* 🃏 YOUR HAND */}
        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(decodeCard(c))}
              style={styles.card}
            />
          ))}
        </div>

        {/* ⏳ COUNTDOWN */}
        {countdown > 0 && (
          <div style={styles.countdown}>
            {countdown}
          </div>
        )}

        <button onClick={goHome}>Exit</button>
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
    width: 65
  },
  center: {
    display: "flex",
    justifyContent: "center",
    gap: 10
  },
  countdown: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 60,
    fontWeight: "bold",
    color: "white"
  }
};