import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// SOUND
// =========================
function playSound(type) {
  const s = {
    play: "https://actions.google.com/sounds/v1/cartoon/pop.ogg",
    draw: "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg",
  };
  new Audio(s[type]).play().catch(() => {});
}

// =========================
// CARD HELPERS
// =========================
function decode(str) {
  return {
    shape: str[0],
    number: Number(str.slice(1)),
  };
}

function encode(card) {
  return card.shape + card.number;
}

// =========================
// CANVAS DRAW
// =========================
const cache = new Map();

function drawCard(card) {
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
  ctx.font = "bold 14px Arial";
  ctx.fillText(card.number, 8, 18);

  const cx = 45, cy = 65;

  if (card.shape === "c") {
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "s") ctx.fillRect(cx - 14, cy - 14, 28, 28);

  if (card.shape === "t") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx - 16, cy + 16);
    ctx.lineTo(cx + 16, cy + 16);
    ctx.closePath();
    ctx.fill();
  }

  if (card.shape === "r") ctx.fillText("★", cx - 8, cy + 6);

  if (card.shape === "x") {
    ctx.fillRect(cx - 3, cy - 16, 6, 32);
    ctx.fillRect(cx - 16, cy - 3, 32, 6);
  }

  const img = c.toDataURL();
  cache.set(key, img);
  return img;
}

// =========================
// PARSE GAME
// =========================
function parse(g) {
  return {
    ...g,
    players: JSON.parse(g.players || "[]"),
    deck: g.deck ? g.deck.split(",") : [],
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(","))
      : [[], []],
    history: g.history ? g.history.split("||") : [],
    pendingPick: Number(g.pendingPick || 0),
  };
}

// =========================
// ENCODE GAME
// =========================
function encodeGame(g) {
  return {
    deck: g.deck.join(","),
    hands: g.hands.map(p => p.join(",")).join("|"),
    history: g.history.slice(-10).join("||"),
    pendingPick: String(g.pendingPick),
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [alerts, setAlerts] = useState([]);

  const gameRef = useRef(null);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId) return;

    const load = async () => {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );
      setGame(parse(g));
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => setGame(parse(res.payload))
    );

    return () => unsub();
  }, [gameId]);

  if (!game || !userId) return <div>Loading...</div>;

  const pIndex = game.players.indexOf(userId);
  const oIndex = pIndex === 0 ? 1 : 0;

  const hand = game.hands[pIndex];
  const top = decode(game.discard);

  function pushAlert(msg) {
    setAlerts(p => [...p.slice(-3), msg]);
    setTimeout(() => setAlerts(p => p.slice(1)), 2000);
  }

  // =========================
  // PLAY
  // =========================
  async function playCard(i) {
    if (game.turn !== userId) return;

    const fresh = parse(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    const cardStr = fresh.hands[pIndex][i];
    const card = decode(cardStr);
    const topCard = decode(fresh.discard);

    if (
      card.number !== topCard.number &&
      card.shape !== topCard.shape &&
      card.number !== 14
    ) return;

    fresh.hands[pIndex].splice(i, 1);
    fresh.discard = cardStr;

    let nextTurn = fresh.players[oIndex];

    // RULES
    if (card.number === 2) {
      fresh.pendingPick += 2;
      fresh.history.push("Pick 2 🔥");
      pushAlert("Pick 2!");
    }

    else if (card.number === 8) {
      nextTurn = userId;
      fresh.history.push("Suspended ⛔");
    }

    else if (card.number === 1) {
      nextTurn = userId;
      fresh.history.push("Hold On 🔁");
    }

    else if (card.number === 14) {
      fresh.pendingPick += 1;
      fresh.history.push("General Market 🛒");
    }

    else {
      fresh.history.push(`${card.shape}${card.number}`);
    }

    // WIN
    if (fresh.hands[pIndex].length === 0) {
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(fresh),
          discard: cardStr,
          status: "finished",
          winnerId: userId,
        }
      );
      return;
    }

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(fresh),
        discard: cardStr,
        turn: nextTurn,
      }
    );

    playSound("play");
  }

  // =========================
  // DRAW
  // =========================
  async function drawCard() {
    if (game.turn !== userId) return;

    const fresh = parse(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    let count = fresh.pendingPick || 1;

    for (let i = 0; i < count; i++) {
      if (!fresh.deck.length) break;
      fresh.hands[pIndex].push(fresh.deck.pop());
    }

    fresh.pendingPick = 0;
    fresh.history.push(`Drew ${count}`);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(fresh),
        turn: fresh.players[oIndex],
      }
    );

    playSound("draw");
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <div style={styles.alertBox}>
          {alerts.map((a, i) => <div key={i}>{a}</div>)}
        </div>

        {/* OPPONENT */}
        <div>
          Opponent Cards: {game.hands[oIndex].length}
          <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
            {game.hands[oIndex].map((_, i) => (
              <div key={i} style={styles.cardBack}></div>
            ))}
          </div>
        </div>

        {/* CENTER */}
        <div style={styles.center}>
          <img src={drawCard(top)} style={{ width: 70 }} />
          <button onClick={drawCard} style={styles.marketBtn}>
            MARKET ({game.deck.length})
          </button>
        </div>

        {/* PLAYER */}
        <div>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(decode(c))}
              style={{ width: 70 }}
              onClick={() => playCard(i)}
            />
          ))}
        </div>

        {/* HISTORY */}
        <div style={styles.history}>
          {game.history.slice().reverse().map((h, i) => (
            <div key={i}>• {h}</div>
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
    alignItems: "center",
  },
  box: {
    width: 420,
    padding: 10,
    background: "#00000066",
    color: "#fff",
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    margin: "10px 0",
  },
  marketBtn: {
    background: "gold",
    border: "none",
    padding: 10,
    fontWeight: "bold",
    borderRadius: 8,
  },
  cardBack: {
    width: 30,
    height: 45,
    background: "#222",
    border: "2px solid gold",
  },
  alertBox: {
    background: "#000000aa",
    color: "yellow",
    padding: 6,
  },
  history: {
    fontSize: 12,
    marginTop: 10,
  },
};