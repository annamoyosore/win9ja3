import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";

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
    scores: g.scores ? g.scores.split(",").map(Number) : [0, 0],
    round: Number(g.round || 1)
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
    history: g.history.slice(-8).join("||"),
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
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const gameRef = useRef(null);

  function notify(msg) {
    setMessage(msg);
    alert(msg);
  }

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME + REALTIME
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

  // =========================
  // LOAD MATCH (FOR POT/STake)
  // =========================
  useEffect(() => {
    if (!game?.matchId) return;

    const loadMatch = async () => {
      try {
        const m = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          game.matchId
        );
        setMatch(m);
      } catch (e) {
        console.log("Match load failed");
      }
    };

    loadMatch();
  }, [game]);

  if (!game || !userId) {
    return <div style={styles.center}>Loading...</div>;
  }

  const stake = Number(match?.stake || 0);
  const pot = Number(match?.pot || 0);

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const opponentHand = game.hands[oppIdx] || [];
  const top = decodeCard(game.discard);

  // =========================
  // END GAME CHECK
  // =========================
  async function checkEnd(g) {
    if (!g.deck.length) {
      const sum = arr =>
        arr.reduce((a, c) => a + decodeCard(c).number, 0);

      const mySum = sum(g.hands[myIdx]);
      const oppSum = sum(g.hands[oppIdx]);

      const winner = mySum <= oppSum ? userId : g.players[oppIdx];

      notify("Game ended by card count!");

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          winnerId: winner
        }
      );
    }
  }

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return notify("Processing...");
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
      ) return notify("Invalid move");

      g.hands[myIdx].splice(i, 1);

      let nextTurn = g.players[oppIdx];

      // RULES
      if (current.number === 2) g.pendingPick += 2;
      if (current.number === 8 || current.number === 1) nextTurn = userId;
      if (current.number === 14) {
        g.pendingPick += 1;
        nextTurn = userId;
      }

      g.history.push(`${current.shape} ${current.number}`);

      // WIN
      if (g.hands[myIdx].length === 0) {
        notify("You win this round!");
        g.scores[myIdx] += 1;

        if (g.scores[myIdx] >= 2) {
          await databases.updateDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            gameId,
            { status: "finished", winnerId: userId }
          );
          return;
        }

        g.round += 1;
        g.history = [];

        return databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          encodeGame(g)
        );
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

      checkEnd(g);

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

    const g = parseGame(
      await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
    );

    let count = g.pendingPick || 1;

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

    setProcessing(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <h3>💰 Stake: ₦{stake}</h3>
        <h3>🏆 Pot: ₦{pot}</h3>

        <p>{message}</p>

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

        <div style={styles.rowWrap}>
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

        {/* HISTORY */}
        <div style={{ marginTop: 20 }}>
          <h4>Moves</h4>
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
  rowWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    justifyContent: "center"
  },
  card: {
    width: 60,
    cursor: "pointer"
  },
  centerRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    margin: "10px 0"
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};