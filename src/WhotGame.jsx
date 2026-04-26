// =========================
// IMPORTS
// =========================
import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";
const USERS_COLLECTION = "users";

// =========================
// CARD RENDER ENGINE (CANVAS)
// =========================
const cache = new Map();

function drawCard(card) {
  const key = `${card.shape}_${card.number}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement("canvas");
  c.width = 90;
  c.height = 130;
  const ctx = c.getContext("2d");

  // background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 90, 130);

  // border
  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 86, 126);

  // number
  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 16px Arial";
  ctx.fillText(card.number, 8, 18);

  const cx = 45, cy = 65;

  // shapes
  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") {
    ctx.fillRect(cx - 14, cy - 14, 28, 28);
  }

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx - 16, cy + 16);
    ctx.lineTo(cx + 16, cy + 16);
    ctx.closePath();
    ctx.fill();
  }

  if (card.shape === "star") {
    ctx.fillText("★", cx - 8, cy + 6);
  }

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
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );

        const parsed = parseGame(g);
        setGame(parsed);
        setLoading(false);

        const oppId = parsed.players.find((p) => p !== userId);
        if (oppId) loadOpponent(oppId);

      } catch {
        setTimeout(load, 500);
      }
    }

    load();
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
      deck: JSON.parse(g.deck || "[]"),
      discard: JSON.parse(g.discard || "[]"),
      hands: JSON.parse(g.hands || "[[],[]]")
    };
  }

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
          {
            status: "finished",
            winnerId: userId
          }
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
  // DRAW CARD
  // =========================
  async function drawCard() {
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
  // UI STATES
  // =========================
  if (loading) {
    return <div style={styles.center}>Loading Game...</div>;
  }

  const playerIndex = game.players.indexOf(userId);
  const hand = game.hands[playerIndex] || [];
  const top = game.discard.at(-1);

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.table}>

      {/* HEADER */}
      <div style={styles.header}>
        <div>💰 ₦{stake}</div>
        <div>
          Opponent: {opponent?.username || "..."} {" "}
          {isOnline(opponent) ? "🟢" : "🔴"}
        </div>
      </div>

      {/* OPPONENT */}
      <div style={styles.opponent}>
        {game.hands[1]?.map((_, i) => (
          <div key={i} style={styles.cardBack}></div>
        ))}
      </div>

      {/* CENTER */}
      <div style={styles.centerArea}>
        {top && <img src={drawCard(top)} style={styles.topCard} />}
        <button style={styles.market} onClick={drawCard}>
          🃏 {game.deck.length}
        </button>
      </div>

      {/* PLAYER HAND */}
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

      {/* FOOTER */}
      <div style={styles.footer}>
        {game.turn === userId ? "🟢 Your Turn" : "⏳ Opponent"}
        <button onClick={goHome}>Exit</button>
      </div>

    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  table: {
    minHeight: "100vh",
    background: "green",
    padding: 10,
    color: "#fff"
  },
  header: {
    display: "flex",
    justifyContent: "space-between"
  },
  opponent: {
    display: "flex",
    justifyContent: "center",
    marginTop: 20
  },
  cardBack: {
    width: 30,
    height: 45,
    background: "#222",
    border: "2px solid gold",
    margin: 2
  },
  centerArea: {
    textAlign: "center",
    margin: 20
  },
  topCard: {
    width: 70
  },
  market: {
    display: "block",
    margin: "10px auto",
    padding: 10,
    background: "gold",
    border: "none"
  },
  hand: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap"
  },
  card: {
    width: 70,
    margin: 5,
    cursor: "pointer"
  },
  footer: {
    textAlign: "center",
    marginTop: 20
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};