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

function lastCardSound() {
  beep(1000, 120);
  setTimeout(() => beep(1200, 120), 150);
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

// =========================
// DRAW CARD
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
  ctx.fillText(card.number, 5, 15);

  const img = c.toDataURL();
  cache.set(key, img);
  return img;
}

// BACK CARD
function drawBackCard() {
  const c = document.createElement("canvas");
  c.width = 70;
  c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 70, 100);

  ctx.fillStyle = "#fff";
  ctx.fillText("🂠", 25, 60);

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
    round: Number(g.round || 1)
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
  const [userId, setUserId] = useState(null);

  const lastLen = useRef(null);

  // ✅ USER SAFE LOAD
  useEffect(() => {
    account.get()
      .then(u => setUserId(u.$id))
      .catch(() => {
        console.log("No session");
      });
  }, []);

  // ✅ GAME LOAD SAFE
  useEffect(() => {
    if (!gameId) return;

    const load = async () => {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );
        setGame(parseGame(g));
      } catch (e) {
        console.error("Game load failed:", e);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        setGame(parseGame(res.payload));
      }
    );

    return () => unsub();
  }, [gameId]);

  // 🔔 LAST CARD ALERT
  useEffect(() => {
    if (!game || !userId) return;

    const myIdx = game.players.indexOf(userId);
    const hand = game.hands[myIdx];

    if (hand && hand.length === 1 && lastLen.current !== 1) {
      lastCardSound();
    }

    lastLen.current = hand?.length;
  }, [game, userId]);

  // =========================
  // LOADING FIX
  // =========================
  if (!game) return <div>Loading game...</div>;
  if (!userId) return <div>Connecting...</div>;

  const myIdx = game.players.indexOf(userId);
  if (myIdx === -1) return <div>Joining game...</div>;

  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppHand = game.hands[oppIdx] || [];

  const top = decodeCard(game.discard);

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        {/* Opponent */}
        <div style={{ textAlign: "center" }}>
          Opponent Cards: {oppHand.length}
          <div style={{ display: "flex", justifyContent: "center" }}>
            {oppHand.map((_, i) => (
              <img key={i} src={drawBackCard()} style={{ width: 30 }} />
            ))}
          </div>
        </div>

        {/* Top */}
        <div style={styles.center}>
          {top && <img src={drawCard(top)} />}
        </div>

        {/* Your Hand */}
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
    justifyContent: "center"
  }
};