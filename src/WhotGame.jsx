import { useEffect, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// 🔊 SOUND ENGINE
// =========================
let audioCtx;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function beep(freq = 400, duration = 0.1) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = freq;
  gain.gain.value = 0.2;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
}

const playSound = () => beep(500);
const drawSound = () => beep(200);
const winSound = () => {
  beep(600);
  setTimeout(() => beep(900), 120);
  setTimeout(() => beep(1200), 240);
};

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
    playerNames: g.playerNames ? g.playerNames.split(",") : [],
    deck: g.deck ? g.deck.split(",").filter(Boolean) : [],
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(",").filter(Boolean))
      : [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||") : [],
    scores: g.scores ? g.scores.split(",").map(Number) : [0, 0],
    round: Number(g.round || 1),
    stake: Number(g.stake || 0),
    pot: Number(g.pot || 0)
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
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [winText, setWinText] = useState("");

  // unlock sound
  useEffect(() => {
    document.addEventListener("click", () => getCtx(), { once: true });
  }, []);

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

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const myName = game.playerNames[myIdx] || "You";
  const oppName = game.playerNames[oppIdx] || "Opponent";

  const hand = game.hands[myIdx];
  const opponentHand = game.hands[oppIdx];
  const top = decodeCard(game.discard);

  // =========================
  // WIN DISPLAY
  // =========================
  function showWinner(text) {
    setWinText(text);
    winSound();
    setTimeout(() => setWinText(""), 4000);
  }

  // =========================
  // END CHECK
  // =========================
  async function checkEnd(g) {
    if (g.deck.length > 0) return;

    const sum = arr =>
      arr.reduce((a, c) => a + decodeCard(c).number, 0);

    const scores = g.hands.map(sum);
    const winnerIdx = scores[0] <= scores[1] ? 0 : 1;

    g.scores[winnerIdx]++;

    showWinner(`${g.playerNames[winnerIdx]} wins round 🎉`);

    if (g.scores[winnerIdx] >= 2) {
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          winnerId: g.players[winnerIdx]
        }
      );

      showWinner(`🏆 ${g.playerNames[winnerIdx]} wins game!`);
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
  // PLAY
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);
    playSound();

    const g = parseGame(
      await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
    );

    if (g.turn !== userId) {
      setProcessing(false);
      return;
    }

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

    let next = g.players[oppIdx];
    let text = "";

    if (current.number === 2) {
      g.pendingPick += 2;
      text = "🔥 Pick 2";
    } else if (current.number === 8) {
      next = userId;
      text = "⛔ Suspension";
    } else if (current.number === 1) {
      next = userId;
      text = "🔁 Hold On";
    } else if (current.number === 14) {
      g.pendingPick += 1;
      next = userId;
      text = "🛒 Market";
    }

    g.history.push(text);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        discard: card,
        turn: next
      }
    );

    await checkEnd(g);
    setProcessing(false);
  }

  // =========================
  // DRAW
  // =========================
  async function drawMarket() {
    if (processing) return;
    setProcessing(true);
    drawSound();

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

    await checkEnd(g);
    setProcessing(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      {winText && <div style={styles.win}>{winText}</div>}

      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <h3>Round {game.round}/3</h3>
        <h4>Score: {game.scores[0]} - {game.scores[1]}</h4>

        <p>👤 You: {myName}</p>
        <p>👤 Opponent: {oppName}</p>

        <p>💰 Stake: ₦{game.stake}</p>
        <p>🏦 Pot: ₦{game.pot}</p>

        <p>Opponent Cards: {opponentHand.length}</p>

        <div style={styles.centerRow}>
          {top && <img src={drawCard(top)} />}
          <button onClick={drawMarket}>
            MARKET ({game.deck.length})
          </button>
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(decodeCard(c))}
              onClick={() => playCard(i)}
            />
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
  win: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#000",
    color: "gold",
    padding: 20,
    fontSize: 20,
    borderRadius: 10
  }
};