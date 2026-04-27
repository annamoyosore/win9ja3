import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// PARSE GAME (SAFE)
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players ? g.players.split(",") : [],
    deck: g.deck ? g.deck.split(",") : [],
    discard: g.discard || "",
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(",").filter(Boolean))
      : [[], []],
    pendingPick: Number(g.pendingPick || 0)
  };
}

// =========================
// ENCODE GAME
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick || 0)
  };
}

// =========================
// DECODE CARD
// =========================
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

// =========================
// CANVAS CARD DRAW
// =========================
const cache = new Map();

function drawCard(card) {
  const key = `${card.shape}_${card.number}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement("canvas");
  c.width = 80;
  c.height = 120;
  const ctx = c.getContext("2d");

  // background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 80, 120);

  // border
  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 76, 116);

  // number
  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 14px Arial";
  ctx.fillText(card.number, 6, 18);

  const cx = 40, cy = 60;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") {
    ctx.fillRect(cx - 12, cy - 12, 24, 24);
  }

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx - 14, cy + 14);
    ctx.lineTo(cx + 14, cy + 14);
    ctx.fill();
  }

  if (card.shape === "star") {
    ctx.fillText("★", cx - 8, cy + 5);
  }

  if (card.shape === "cross") {
    ctx.fillRect(cx - 3, cy - 14, 6, 28);
    ctx.fillRect(cx - 14, cy - 3, 28, 6);
  }

  const img = c.toDataURL();
  cache.set(key, img);
  return img;
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const gameRef = useRef(null);

  // LOAD USER
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // LOAD + REALTIME
  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );
      const parsed = parseGame(g);
      setGame(parsed);
      gameRef.current = parsed;
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => {
        const parsed = parseGame(res.payload);
        setGame({ ...parsed }); // 🔥 force re-render
        gameRef.current = parsed;
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div style={styles.center}>Loading...</div>;

  const myIndex = game.players.indexOf(userId);
  const oppIndex = myIndex === 0 ? 1 : 0;

  const hand = game.hands[myIndex] || [];
  const opponentHand = game.hands[oppIndex] || [];

  const top = decodeCard(game.discard);

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

      let g = parseGame(fresh);

      if (g.turn !== userId) return;

      const myIdx = g.players.indexOf(userId);
      const oppIdx = myIdx === 0 ? 1 : 0;

      const card = g.hands[myIdx][i];
      if (!card) return;

      const current = decodeCard(card);
      const topDecoded = decodeCard(g.discard);

      // VALIDATION
      if (
        current.number !== topDecoded.number &&
        current.shape !== topDecoded.shape &&
        current.number !== 14
      ) return;

      // REMOVE CARD
      g.hands[myIdx].splice(i, 1);

      let nextTurn = g.players[oppIdx];

      // ================= RULES =================
      if (current.number === 2) {
        g.pendingPick += 2;
      }

      else if (current.number === 8) {
        nextTurn = userId;
      }

      else if (current.number === 1) {
        nextTurn = userId;
      }

      else if (current.number === 14) {
        g.pendingPick += 1;
        nextTurn = userId;
      }

      // WIN
      if (g.hands[myIdx].length === 0) {
        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          {
            ...encodeGame(g),
            discard: card,
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
          ...encodeGame(g),
          discard: card,
          turn: nextTurn
        }
      );

    } finally {
      setProcessing(false);
    }
  }

  // =========================
  // DRAW MARKET
  // =========================
  async function drawMarket() {
    if (processing) return;
    setProcessing(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      let g = parseGame(fresh);

      if (g.turn !== userId) return;

      const myIdx = g.players.indexOf(userId);
      const oppIdx = myIdx === 0 ? 1 : 0;

      let count = g.pendingPick > 0 ? g.pendingPick : 1;

      for (let i = 0; i < count; i++) {
        if (!g.deck.length) break;
        g.hands[myIdx].push(g.deck.pop());
      }

      g.pendingPick = 0;

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(g),
          turn: g.players[oppIdx]
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
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <p>
          Turn: {game.turn === userId ? "🟢 You" : "⏳ Opponent"}
        </p>

        {/* OPPONENT */}
        <div style={styles.row}>
          {opponentHand.map((_, i) => (
            <div key={i} style={styles.back}></div>
          ))}
        </div>

        {/* CENTER */}
        <div style={styles.centerRow}>
          {top && (
            <img
              src={drawCard(top)}
              style={styles.cardImg}
            />
          )}

          <button onClick={drawMarket}>
            MARKET ({game.deck.length})
          </button>
        </div>

        {/* PLAYER HAND */}
        <div style={styles.row}>
          {hand.map((c, i) => {
            const d = decodeCard(c);
            return (
              <img
                key={i}
                src={drawCard(d)}
                style={styles.cardImg}
                onClick={() => playCard(i)}
              />
            );
          })}
        </div>

        <button onClick={goHome}>Exit</button>
      </div>
    </div>
  );
}

// =========================
// STYLES (RESTORED)
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
    width: 420,
    background: "#000000cc",
    padding: 12,
    color: "#fff",
    borderRadius: 10
  },
  row: {
    display: "flex",
    gap: 6,
    justifyContent: "center",
    margin: "8px 0"
  },
  back: {
    width: 30,
    height: 45,
    background: "#222",
    border: "2px solid gold",
    borderRadius: 4
  },
  centerRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    margin: "10px 0"
  },
  cardImg: {
    width: 70,
    cursor: "pointer",
    borderRadius: 6,
    transition: "0.2s"
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};