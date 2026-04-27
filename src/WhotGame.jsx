import { useEffect, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// HELPERS
// =========================
function shuffleDeck() {
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
// PARSE GAME
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players ? g.players.split(",").filter(Boolean) : [],
    playerNames: g.playerNames ? g.playerNames.split(",") : [],
    deck: g.deck ? g.deck.split(",").filter(Boolean) : [],
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(",").filter(Boolean))
      : [[], []],
    discard: g.discard || "",
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||") : [],
    scores: g.scores ? g.scores.split(",").map(Number) : [0, 0],
    round: Number(g.round || 1),
    stake: Number(g.stake || 0),
    pot: Number(g.pot || 0),
    status: g.status || "running"
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
    pendingPick: String(g.pendingPick),
    history: g.history.slice(-10).join("||"),
    scores: g.scores.join(","),
    round: String(g.round)
  };
}

// =========================
// DECODE CARD
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
// CANVAS CARD
// =========================
const cache = new Map();

function drawCard(card) {
  if (!card) return "";

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
  ctx.fillText(card.number, 6, 16);

  const cx = 35, cy = 55;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  if (card.shape === "square") ctx.fillRect(cx - 10, cy - 10, 20, 20);

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.fill();
  }

  if (card.shape === "star") ctx.fillText("★", cx - 6, cy + 5);

  if (card.shape === "cross") {
    ctx.fillRect(cx - 3, cy - 12, 6, 24);
    ctx.fillRect(cx - 12, cy - 3, 24, 6);
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

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );
      setGame(parseGame(g));
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => setGame(parseGame(res.payload))
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) {
    return <div style={styles.center}>Loading...</div>;
  }

  if (game.status === "finished") {
    return (
      <div style={styles.center}>
        🏆 Winner:{" "}
        {game.winnerId === userId ? "You 🎉" : "Opponent"}
        <button onClick={goHome}>Exit</button>
      </div>
    );
  }

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const opponentHand = game.hands[oppIdx] || [];
  const top = decodeCard(game.discard);

  // =========================
  // ROUND END
  // =========================
  async function checkRoundEnd(g) {
    const sum = arr =>
      arr.reduce((a, c) => a + decodeCard(c).number, 0);

    // empty hand
    if (g.hands[0].length === 0 || g.hands[1].length === 0) {
      const winnerIdx = g.hands[0].length === 0 ? 0 : 1;
      g.scores[winnerIdx]++;
      return finishRound(g, winnerIdx);
    }

    // market empty
    if (g.deck.length === 0) {
      const totals = g.hands.map(sum);
      const winnerIdx = totals[0] <= totals[1] ? 0 : 1;
      g.scores[winnerIdx]++;
      return finishRound(g, winnerIdx);
    }
  }

  // =========================
  // FINISH ROUND
  // =========================
  async function finishRound(g, winnerIdx) {
    alert(`🏆 ${g.playerNames[winnerIdx] || "Player"} wins round`);

    // game winner
    if (g.scores[winnerIdx] >= 2) {
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          winnerId: g.players[winnerIdx],
          scores: g.scores.join(",")
        }
      );
      return;
    }

    // next round
    g.round++;
    g.deck = shuffleDeck();
    g.hands = [g.deck.splice(0, 6), g.deck.splice(0, 6)];
    g.discard = g.deck.pop();
    g.pendingPick = 0;
    g.history = [`--- Round ${g.round} ---`];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        turn: g.players[1]
      }
    );
  }

  // =========================
  // DRAW
  // =========================
  async function drawMarket() {
    if (processing) return;
    setProcessing(true);

    const g = parseGame(
      await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
    );

    if (g.turn !== userId) {
      setProcessing(false);
      return;
    }

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

    await checkRoundEnd(g);

    setProcessing(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h3>🎮 WHOT</h3>

        <p>Round {game.round}/3</p>
        <p>Score: {game.scores[0]} - {game.scores[1]}</p>

        <p>💰 Stake: ₦{game.stake}</p>
        <p>🏦 Pot: ₦{game.pot}</p>

        <p>Opponent Cards: {opponentHand.length}</p>

        <div style={styles.centerRow}>
          {top && <img src={drawCard(top)} />}
          <button onClick={drawMarket}>
            Market ({game.deck.length})
          </button>
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img key={i} src={drawCard(decodeCard(c))} />
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
    background: "#065f46",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  box: {
    width: "95%",
    maxWidth: 420,
    background: "#000000cc",
    padding: 10,
    color: "#fff"
  },
  hand: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 5
  },
  centerRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};