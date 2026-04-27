import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// PARSE GAME
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players ? g.players.split(",").filter(Boolean) : [],
    deck: g.deck ? g.deck.split(",").filter(Boolean) : [],
    discard: g.discard || "",
    hands: g.hands
      ? g.hands.split("|").map(p => (p ? p.split(",").filter(Boolean) : []))
      : [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||") : [],
    round: Number(g.round || 1),
    score: g.score ? JSON.parse(g.score) : {}
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
    pendingPick: String(g.pendingPick || 0),
    history: g.history.slice(-10).join("||"),
    round: String(g.round || 1),
    score: JSON.stringify(g.score || {})
  };
}

// =========================
// CARD DECODER
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
// CARD VALUE (FOR FINAL WIN)
// =========================
function cardValue(card) {
  const n = Number(card.slice(1));
  if (n >= 10) return 10;
  return n;
}

// =========================
// CANVAS DRAW
// =========================
const cache = new Map();

function drawCard(card) {
  if (!card) return null;

  const key = `${card.shape}_${card.number}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement("canvas");
  c.width = 80;
  c.height = 120;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 80, 120);

  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 76, 116);

  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 14px Arial";
  ctx.fillText(card.number, 6, 18);

  const cx = 40, cy = 60;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  if (card.shape === "square") ctx.fillRect(cx - 12, cy - 12, 24, 24);
  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx - 14, cy + 14);
    ctx.lineTo(cx + 14, cy + 14);
    ctx.fill();
  }
  if (card.shape === "star") ctx.fillText("★", cx - 8, cy + 5);
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

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME
  // =========================
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
        setGame({ ...parsed });
        gameRef.current = parsed;
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div style={styles.center}>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const opponentHand = game.hands[oppIdx] || [];
  const top = decodeCard(game.discard);

  // =========================
  // END ROUND LOGIC
  // =========================
  async function endRound(g) {
    const scores = g.score || {};

    // calculate hand values
    const totals = g.hands.map(h =>
      h.reduce((sum, c) => sum + cardValue(c), 0)
    );

    const winnerIndex = totals[0] <= totals[1] ? 0 : 1;
    const winnerId = g.players[winnerIndex];

    scores[winnerId] = (scores[winnerId] || 0) + 1;

    // check final winner (best of 3)
    if (scores[winnerId] >= 2) {
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          winnerId,
          score: JSON.stringify(scores)
        }
      );
      alert("🏆 GAME WINNER!");
      return;
    }

    // next round reset
    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        round: String(g.round + 1),
        history: "",
        pendingPick: "0",
        score: JSON.stringify(scores)
      }
    );
  }

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);

    const g = parseGame(
      await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
    );

    if (g.turn !== userId) return setProcessing(false);

    const myIdx = g.players.indexOf(userId);
    const oppIdx = myIdx === 0 ? 1 : 0;

    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) {
      setProcessing(false);
      return;
    }

    g.hands[myIdx].splice(i, 1);

    // win immediately
    if (g.hands[myIdx].length === 0) {
      await endRound(g);
      return;
    }

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        discard: card,
        turn: g.players[oppIdx]
      }
    );

    setProcessing(false);
  }

  // =========================
  // DRAW MARKET
  // =========================
  async function drawMarket() {
    if (processing) return;
    setProcessing(true);

    const g = parseGame(
      await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
    );

    if (!g.deck.length) {
      await endRound(g); // 🔥 MARKET EMPTY RULE
      return;
    }

    const myIdx = g.players.indexOf(userId);
    const oppIdx = myIdx === 0 ? 1 : 0;

    g.hands[myIdx].push(g.deck.pop());

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        turn: g.players[oppIdx]
      }
    );

    setProcessing(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <p>Round: {game.round}/3</p>
        <p>💰 Stake: ₦{game.stake || 0} | Pot: ₦{game.pot || 0}</p>

        <p>
          Turn: {game.turn === userId ? "🟢 You" : "⏳ Opponent"}
        </p>

        <p>Opponent Cards: {opponentHand.length}</p>

        <div style={styles.centerRow}>
          {top && <img src={drawCard(top)} style={{ width: 65 }} />}
          <button onClick={drawMarket}>
            MARKET ({game.deck.length})
          </button>
        </div>

        <div style={styles.handWrap}>
          {hand.map((c, i) => {
            const d = decodeCard(c);
            return (
              <img
                key={i}
                src={drawCard(d)}
                style={styles.card}
                onClick={() => playCard(i)}
              />
            );
          })}
        </div>

        <div style={styles.history}>
          {game.history.slice().reverse().map((h, i) => (
            <div key={i}>{h}</div>
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
    width: 420,
    background: "#000000cc",
    padding: 10,
    color: "#fff"
  },
  centerRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    margin: "10px 0"
  },
  handWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    justifyContent: "center"
  },
  card: {
    width: 60,
    cursor: "pointer"
  },
  history: {
    marginTop: 10,
    maxHeight: 100,
    overflowY: "auto",
    fontSize: 12
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};