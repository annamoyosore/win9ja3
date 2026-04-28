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
// 🎴 VALID DECK
// =========================
function createDeck() {
  const rules = {
    c: [1,2,3,4,5,7,8,10,11,12,13,14],
    t: [1,2,3,4,5,7,8,10,11,12,13,14],
    s: [1,2,3,5,7,10,11,13,14],
    x: [1,2,3,5,7,10,11,13,14],
    r: [1,2,3,4,5,7,8]
  };

  let deck = [];
  for (let s in rules) {
    for (let n of rules[s]) {
      deck.push(s + n);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// SAFE PARSE
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players?.split(",") || [],
    deck: g.deck?.split(",").filter(Boolean) || [],
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(",").filter(Boolean))
      : [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history?.split("||").filter(Boolean) || [],
    scores: g.scores?.split(",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    hostName: g.hostName,
    opponentName: g.opponentName,
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
  const payoutRef = useRef(false);

  // =========================
  // USER LOAD
  // =========================
  useEffect(() => {
    account.get()
      .then(u => setUserId(u.$id))
      .catch(err => {
        console.error("USER ERROR:", err);
      });
  }, []);

  // =========================
  // GAME LOAD
  // =========================
  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      try {
        const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
        setGame(parseGame(g));

        if (g.matchId) {
          const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
          setMatch(m);
        }
      } catch (err) {
        console.error("LOAD ERROR:", err);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        try {
          const parsed = parseGame(res.payload);
          setGame(parsed);
        } catch (e) {
          console.error("SUB ERROR:", e);
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  // =========================
  // SAFE LOADING STATES
  // =========================
  if (!userId) return <div>Loading user...</div>;
  if (!game) return <div>Loading game...</div>;
  if (!game.players.includes(userId)) return <div>Waiting for opponent...</div>;

  // =========================
  // NORMAL GAME CONTINUES
  // =========================

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;

  // UI preserved below...