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

// =========================
// 🔊 SOUND
// =========================
function beep(freq = 200, duration = 200) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

// =========================
// 🎴 DECK
// =========================
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

// =========================
// SAFE PARSE
// =========================
function parseGame(g) {
  const safeSplit = (v, sep) =>
    typeof v === "string" ? v.split(sep).filter(Boolean) : [];

  const players = Array.isArray(g.players)
    ? g.players
    : safeSplit(g.players, ",");

  const handsRaw = safeSplit(g.hands, "|");

  let hands =
    handsRaw.length === 2
      ? handsRaw.map(p => safeSplit(p, ","))
      : [[], []];

  let deck = safeSplit(g.deck, ",");

  // 🔥 AUTO FIX BROKEN GAME (very important)
  if (!deck.length || !hands[0].length || !hands[1].length || !g.discard) {
    const newDeck = createDeck();
    hands = [newDeck.splice(0, 6), newDeck.splice(0, 6)];
    const discard = newDeck.pop();

    return {
      ...g,
      players,
      hands,
      deck: newDeck,
      discard,
      turn: players[0],
      pendingPick: 0,
      history: [],
      scores: [0, 0],
      round: 1,
      status: "playing",
      pot: Number(g.pot || 0)
    };
  }

  return {
    ...g,
    players,
    hands,
    deck,
    discard: g.discard,
    turn: g.turn || players[0],
    pendingPick: Number(g.pendingPick || 0),
    history: safeSplit(g.history, "||"),
    scores: safeSplit(g.scores, ",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    pot: Number(g.pot || 0),
    payoutDone: Boolean(g.payoutDone)
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    turn: g.turn,
    pendingPick: String(g.pendingPick),
    history: (g.history || []).slice(-20).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status,
    pot: g.pot
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome, openChat }) {

  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");

  const actionLock = useRef(false);

  function invalidMove(msg) {
    beep(120, 300);
    setError(msg);
    setTimeout(() => setError(""), 1000);
  }

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      setGame(parseGame(g));
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        setGame(parseGame(res.payload));
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;

  const top = game.discard
    ? { shape: game.discard[0], number: Number(game.discard.slice(1)) }
    : null;

  async function endRound(g, winnerIdx) {
    g = JSON.parse(JSON.stringify(g));

    g.scores[winnerIdx]++;

    // 🔥 FINAL GAME
    if (g.round >= 3) {
      const finalWinner =
        g.scores[0] > g.scores[1] ? 0 : 1;

      await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
        ...encodeGame(g),
        status: "finished",
        winnerId: g.players[finalWinner]
      });
      return;
    }

    // 🔥 NEXT ROUND RESET
    const deck = createDeck();
    g.hands = [deck.splice(0, 6), deck.splice(0, 6)];
    g.discard = deck.pop();
    g.deck = deck;
    g.pendingPick = 0;
    g.round++;

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      encodeGame(g)
    );
  }
async function playCard(i) {
    if (actionLock.current) return;
    if (game.turn !== userId) return invalidMove("Not your turn");

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];

    const top = g.discard;

    // VALIDATION
    if (
      card[0] !== top[0] &&
      card.slice(1) !== top.slice(1) &&
      card.slice(1) !== "14"
    ) {
      actionLock.current = false;
      return invalidMove("Invalid move");
    }

    g.hands[myIdx].splice(i, 1);

    g.history = [...(g.history || []), `${userId} played ${card}`];

    let nextTurn = g.players[oppIdx];

    // ROUND WIN
    if (!g.hands[myIdx].length) {
      await endRound(g, myIdx);
      actionLock.current = false;
      return;
    }

    setGame({ ...g, discard: card, turn: nextTurn });

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      discard: card,
      turn: nextTurn
    });

    actionLock.current = false;
  }

  async function drawMarket() {
    if (actionLock.current) return;
    if (game.turn !== userId) return invalidMove("Wait your turn");

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));

    // 🔥 MARKET EMPTY → FORCE WINNER
    if (!g.deck.length) {
      const winner =
        g.hands[0].length <= g.hands[1].length ? 0 : 1;

      await endRound(g, winner);
      actionLock.current = false;
      return;
    }

    g.hands[myIdx].push(g.deck.pop());

    g.history = [...(g.history || []), `${userId} picked card`];

    const nextTurn = g.players[oppIdx];

    setGame({ ...g, turn: nextTurn });

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      turn: nextTurn
    });

    actionLock.current = false;
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>

        <h2>🎮 WHOT GAME</h2>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.row}>
          <span>You</span>
          <span>VS</span>
          <span>Opponent</span>
        </div>

        <div style={{ textAlign: "center" }}>
          Opponent Cards: {oppCards}
        </div>

        <div style={styles.row}>
          <span>Round {game.round}/3</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        <div style={styles.center}>
          {top && <div style={styles.card}>{game.discard}</div>}
          <button style={styles.marketBtn} onClick={drawMarket}>
            🃏 {game.deck.length}
          </button>
        </div>

        <div style={styles.history}>
          {(game.history || []).slice(-5).map((h, i) => (
            <div key={i}>{h}</div>
          ))}
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => (
            <div
              key={i}
              style={styles.card}
              onClick={() => playCard(i)}
            >
              {c}
            </div>
          ))}
        </div>

        <button onClick={goHome}>Exit</button>
      </div>
    </div>
  );
}