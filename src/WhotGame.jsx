// =========================
// IMPORTS
// =========================
import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";
const USERS_COLLECTION = "users";

// =========================
// CARD RENDER
// =========================
const cache = new Map();

function renderCard(card) {
  if (!card) return "";

  const key = `${card.shape}_${card.number}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement("canvas");
  c.width = 90;
  c.height = 130;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 90, 130);

  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 86, 126);

  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 16px Arial";
  ctx.fillText(card.number, 8, 18);

  const cx = 45, cy = 65;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") ctx.fillRect(cx - 14, cy - 14, 28, 28);

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx - 16, cy + 16);
    ctx.lineTo(cx + 16, cy + 16);
    ctx.closePath();
    ctx.fill();
  }

  if (card.shape === "star") ctx.fillText("★", cx - 8, cy + 6);

  if (card.shape === "cross") {
    ctx.fillRect(cx - 3, cy - 16, 6, 32);
    ctx.fillRect(cx - 16, cy - 3, 32, 6);
  }

  const img = c.toDataURL();
  cache.set(key, img);
  return img;
}

// =========================
// ONLINE STATUS
// =========================
function isOnline(user) {
  if (!user?.lastSeen) return false;
  return Date.now() - new Date(user.lastSeen).getTime() < 15000;
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, stake = 0, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const gameRef = useRef(null);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then((u) => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME (SAFE)
  // =========================
  useEffect(() => {
    if (!gameId || !userId) return;

    let retry;

    async function load() {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );

        const parsed = parseGame(g);

        // 🔥 WAIT until players exist
        if (!parsed.players || parsed.players.length < 2) {
          retry = setTimeout(load, 500);
          return;
        }

        setGame(parsed);
        setLoading(false);

        const oppId = parsed.players.find((p) => p !== userId);
        if (oppId) loadOpponent(oppId);

      } catch {
        retry = setTimeout(load, 800);
      }
    }

    load();
    return () => clearTimeout(retry);
  }, [gameId, userId]);

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const parsed = parseGame(res.payload);

        // prevent bad updates
        if (!parsed.players || parsed.players.length < 2) return;

        setGame(parsed);
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // LOAD OPPONENT
  // =========================
  async function loadOpponent(id) {
    try {
      const u = await databases.getDocument(
        DATABASE_ID,
        USERS_COLLECTION,
        id
      );
      setOpponent(u);
    } catch {}
  }

  // =========================
  // PARSE
  // =========================
  function parseGame(g) {
    return {
      ...g,
      players: g.players || [],
      deck: JSON.parse(g.deck || "[]"),
      discard: JSON.parse(g.discard || "[]"),
      hands: JSON.parse(g.hands || "[[],[]]")
    };
  }

  // =========================
  // SAFE UI GUARD 🔥
  // =========================
  if (loading || !game || !userId) {
    return <div style={styles.center}>Loading Game...</div>;
  }

  if (!game.players.includes(userId)) {
    return (
      <div style={styles.center}>
        ❌ You are not part of this game
        <br />
        <button onClick={goHome}>Go Back</button>
      </div>
    );
  }

  const playerIndex = game.players.indexOf(userId);
  const opponentIndex = playerIndex === 0 ? 1 : 0;

  const hand = game.hands[playerIndex] || [];
  const opponentHand = game.hands[opponentIndex] || [];
  const top = game.discard?.at(-1);

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const g = parseGame(fresh);

      if (g.turn !== userId) return;

      const pIndex = g.players.indexOf(userId);
      const oIndex = pIndex === 0 ? 1 : 0;

      const card = g.hands[pIndex][i];
      const top = g.discard.at(-1);

      if (!card || !top) return;
      if (card.number !== top.number && card.shape !== top.shape) return;

      g.hands[pIndex].splice(i, 1);
      g.discard.push(card);

      if (g.hands[pIndex].length === 0) {
        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          { status: "finished", winnerId: userId }
        );
        return;
      }

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          hands: JSON.stringify(g.hands),
          discard: JSON.stringify(g.discard),
          turn: g.players[oIndex]
        }
      );

    } finally {
      setProcessing(false);
    }
  }

  // =========================
  // DRAW
  // =========================
  async function drawFromMarket() {
    if (processing) return;
    setProcessing(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const g = parseGame(fresh);

      if (g.turn !== userId) return;

      const pIndex = g.players.indexOf(userId);
      const oIndex = pIndex === 0 ? 1 : 0;

      if (!g.deck.length) return;

      g.hands[pIndex].push(g.deck.pop());

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          hands: JSON.stringify(g.hands),
          deck: JSON.stringify(g.deck),
          turn: g.players[oIndex]
        }
      );

    } finally {
      setProcessing(false);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.table}>

      <div style={styles.header}>
        <div>💰 ₦{stake}</div>
        <div>
          {opponent?.username || "Opponent"}{" "}
          {isOnline(opponent) ? "🟢" : "🔴"}
        </div>
      </div>

      <div style={styles.opponent}>
        {opponentHand.map((_, i) => (
          <div key={i} style={styles.cardBack}></div>
        ))}
      </div>

      <div style={styles.centerArea}>
        {top && <img src={renderCard(top)} style={styles.topCard} />}
        <button style={styles.market} onClick={drawFromMarket}>
          🃏 {game.deck.length}
        </button>
      </div>

      <div style={styles.hand}>
        {hand.map((c, i) => (
          <img
            key={i}
            src={renderCard(c)}
            style={styles.card}
            onClick={() => playCard(i)}
          />
        ))}
      </div>

      <div style={styles.footer}>
        {game.turn === userId ? "🟢 Your Turn" : "⏳ Opponent Turn"}
        <button onClick={goHome}>Exit</button>
      </div>
    </div>
  );
}