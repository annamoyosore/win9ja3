import { useEffect, useRef, useState } from "react";
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
// PARSE / ENCODE
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players ? g.players.split(",") : [],
    deck: g.deck ? g.deck.split(",").filter(Boolean) : [],
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(",").filter(Boolean))
      : [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||") : [],
    scores: g.scores ? g.scores.split(",").map(Number) : [0, 0],
    round: Number(g.round || 1),
    stake: Number(g.stake || 0),
    pot: Number(g.pot || 0),
    hostName: g.hostName || "Host",
    opponentName: g.opponentName || "Opponent"
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick),
    history: g.history.slice(-8).join("||"),
    scores: g.scores.join(","),
    round: String(g.round)
  };
}

// =========================
// CANVAS CARD
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
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const gameRef = useRef(null);

  function notify(msg) {
    alert(msg);
  }

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
      const parsed = parseGame(g);
      setGame(parsed);
      gameRef.current = parsed;
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => {
        const parsed = parseGame(res.payload);
        setGame(parsed);
        gameRef.current = parsed;
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) {
    return <div style={styles.center}>Loading...</div>;
  }

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const opponentHand = game.hands[oppIdx] || [];
  const top = decodeCard(game.discard);

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);

    try {
      const g = parseGame(
        await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
      );

      if (g.turn !== userId) return notify("Not your turn");

      const card = g.hands[myIdx][i];
      const current = decodeCard(card);
      const topDecoded = decodeCard(g.discard);

      if (
        current.number !== topDecoded.number &&
        current.shape !== topDecoded.shape &&
        current.number !== 14
      ) {
        return notify("Invalid move");
      }

      g.hands[myIdx].splice(i, 1);

      let nextTurn = g.players[oppIdx];
      let text = `${current.shape} ${current.number}`;

      if (current.number === 2) {
        g.pendingPick += 2;
        text = "🔥 Pick 2";
      } else if (current.number === 8) {
        nextTurn = userId;
        text = "⛔ Suspension";
      } else if (current.number === 1) {
        nextTurn = userId;
        text = "🔁 Hold On";
      } else if (current.number === 14) {
        g.pendingPick += 1;
        nextTurn = userId;
        text = "🛒 General Market";
      }

      g.history.push(text);

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

    } catch (e) {
      notify(e.message);
    }

    setProcessing(false);
  }

  // =========================
  // DRAW
  // =========================
  async function drawMarket() {
    if (processing) return;
    setProcessing(true);

    try {
      const g = parseGame(
        await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
      );

      if (g.turn !== userId) return notify("Not your turn");

      let count = g.pendingPick > 0 ? g.pendingPick : 1;

      for (let i = 0; i < count; i++) {
        if (!g.deck.length) break;
        g.hands[myIdx].push(g.deck.pop());
      }

      g.pendingPick = 0;
      g.history.push(`Drew ${count}`);

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(g),
          turn: g.players[oppIdx]
        }
      );

    } catch (e) {
      notify(e.message);
    }

    setProcessing(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <div style={styles.rowBetween}>
          <span>{game.hostName}</span>
          <span>VS</span>
          <span>{game.opponentName}</span>
        </div>

        <div style={styles.rowBetween}>
          <span>Round {game.round}/3</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        <div style={styles.rowBetween}>
          <span>₦{game.stake}</span>
          <span>₦{game.pot}</span>
        </div>

        <p>
          Turn: {game.turn === userId ? "You" : "Opponent"}
        </p>

        <p>Opponent Cards: {opponentHand.length}</p>

        <div style={styles.centerRow}>
          {top && <img src={drawCard(top)} />}
          <button onClick={drawMarket}>
            MARKET ({game.deck.length})
          </button>
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => {
            const d = decodeCard(c);
            return (
              <img
                key={i}
                src={drawCard(d)}
                style={{ cursor: "pointer" }}
                onClick={() => playCard(i)}
              />
            );
          })}
        </div>

        <div style={styles.history}>
          {game.history.slice().reverse().map((h, i) => (
            <div
              key={i}
              style={{
                color:
                  h.includes("Pick") ||
                  h.includes("Hold") ||
                  h.includes("Suspension") ||
                  h.includes("Market")
                    ? "red"
                    : "white"
              }}
            >
              {h}
            </div>
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
    background: "#000000aa",
    padding: 10,
    color: "#fff"
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 6
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
  history: {
    marginTop: 10,
    maxHeight: 120,
    overflow: "auto",
    fontSize: 12
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};