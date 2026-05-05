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

// 🔊 SAFE SOUND
function beep(freq = 200, duration = 200) {
  try {
    if (typeof window === "undefined") return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
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

function successSound() {
  beep(600, 200);
  setTimeout(() => beep(800, 200), 150);
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
// 🎴 SAFE DECODE
function decodeCard(str) {
  if (!str || typeof str !== "string") return null;

  const map = {
    c: "circle",
    t: "triangle",
    s: "square",
    r: "star",
    x: "cross"
  };

  const shape = map[str[0]];
  const number = Number(str.slice(1));

  if (!shape || isNaN(number)) return null;

  return { shape, number };
}

// 🎴 DRAW
const cache = new Map();

function drawCard(card) {
  if (!card || typeof window === "undefined") return null;

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

function drawBack() {
  if (typeof window === "undefined") return null;

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
function parseGame(g) {
  const split = (v, s) =>
    typeof v === "string" ? v.split(s).filter(Boolean) : [];

  const players = Array.isArray(g.players)
    ? g.players
    : split(g.players, ",");

  const handsRaw = split(g.hands, "|");

  const hands =
    handsRaw.length === 2
      ? handsRaw.map(p => split(p, ","))
      : [[], []];

  return {
    ...g,
    players,
    hands,
    deck: split(g.deck, ","),
    discard: g.discard || null,
    turn: g.turn || null,
    pendingPick: Number(g.pendingPick || 0),
    history: split(g.history, "||"),
    scores: split(g.scores, ",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
    winnerId: g.winnerId || null,
    matchId: g.matchId || null,
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2"
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard || "",
    turn: g.turn,
    pendingPick: String(g.pendingPick),
    history: (g.history || []).slice(-10).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status
  };
}

function ensureGameReady(g) {
  if (!g.deck?.length || !g.hands?.[0]?.length || !g.hands?.[1]?.length || !g.discard) {
    const deck = createDeck();
    return {
      ...g,
      hands: [deck.splice(0,6), deck.splice(0,6)],
      discard: deck.pop(),
      deck,
      pendingPick: 0,
      history: [],
      scores: [0,0],
      round: 1,
      status: "playing"
    };
  }
  return g;
}

function pushHistory(g, text) {
  return [...(g.history || []), text].slice(-10);
}
export default function WhotGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [showWin, setShowWin] = useState(false);
  const [ruleText, setRuleText] = useState("");

  const payoutRef = useRef(false);
  const actionLock = useRef(false);

  function invalidMove(msg) {
    beep(120, 300);
    setError(msg);
    setTimeout(() => setError(""), 1200);
  }

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      let parsed = parseGame(g);
      const fixed = ensureGameReady(parsed);

      if (JSON.stringify(parsed) !== JSON.stringify(fixed)) {
        await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, encodeGame(fixed));
      }

      setGame(fixed);

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

        setGame(prev =>
          JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed
        );

        if (parsed.pendingPick > 0) setRuleText(`🔥 PICK ${parsed.pendingPick}`);
        else if (parsed.turn === userId) setRuleText("🟢 YOUR TURN");
        else setRuleText("⏳ OPPONENT TURN");

        if (parsed.status === "finished") {
          if (parsed.winnerId === userId) {
            setShowWin(true);
            successSound();
            setTimeout(goHome, 3000);
          } else {
            setTimeout(goHome, 2500);
          }

          if (parsed.winnerId !== userId) return;
          if (payoutRef.current) return;
          payoutRef.current = true;

          try {
            const freshGame = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, parsed.$id);
            if (freshGame.payoutDone) return;

            await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, parsed.$id, { payoutDone: true });

            let pot = 0;

            if (parsed.matchId) {
              const freshMatch = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, parsed.matchId);
              pot = Number(freshMatch.pot || 0);

              await databases.updateDocument(DATABASE_ID, MATCH_COLLECTION, parsed.matchId, {
                pot: 0,
                status: "finished"
              });
            }

            if (pot <= 0) return;

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
                { balance: Number(w.balance || 0) + pot }
              );
            }

          } catch (e) {
            console.error("❌ payout error:", e);
          }
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  if (myIdx === -1) return <div>Invalid player</div>;

  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;
  const top = game.discard ? decodeCard(game.discard) : null;

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  return (
    <div style={{ padding: 20 }}>
      <h2>WHOT GAME</h2>

      {error && <div style={{ color: "red" }}>{error}</div>}

      <p>{ruleText}</p>

      <p>{myName} vs {oppName}</p>

      <p>Opponent Cards: {oppCards}</p>

      <p>Score: {game.scores[0]} - {game.scores[1]}</p>

      <p>Pot: ₦{match?.pot || 0}</p>

      {top && drawCard(top) && <img src={drawCard(top)} width={70} />}

      <div>
        {hand.map((c, i) => {
          const decoded = decodeCard(c);
          if (!decoded) return null;

          return (
            <img
              key={i}
              src={drawCard(decoded)}
              width={70}
              onClick={() => {}}
            />
          );
        })}
      </div>

      {showWin && <h2>🎉 You Won!</h2>}

      <button onClick={goHome}>Exit</button>
    </div>
  );
}