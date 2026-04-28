import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";
import { creditWallet, adminCredit } from "./lib/wallet";

const GAME_COLLECTION = "games";

// =========================
// SOUND
// =========================
function beep(freq = 400, duration = 120) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + duration / 1000
  );

  setTimeout(() => {
    osc.stop();
    ctx.close();
  }, duration);
}

// =========================
// HELPERS
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
    payoutDone: g.payoutDone || false
  };
}

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
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [showWin, setShowWin] = useState(false);

  const winnerShown = useRef(false);

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
      res => {
        const parsed = parseGame(res.payload);
        setGame(parsed);

        if (parsed.status === "finished" && !winnerShown.current) {
          winnerShown.current = true;
          setShowWin(true);
          beep(800, 200);
          beep(1000, 200);
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const top = decodeCard(game.discard);

  // =========================
  // 💰 PAYOUT SYSTEM
  // =========================
  async function handlePayout(g, winnerIdx) {
    if (g.payoutDone) return;

    const adminFee = Math.floor(g.pot * 0.1);
    const winnerAmount = g.pot - adminFee;

    try {
      // ✅ PAY WINNER
      await creditWallet(g.players[winnerIdx], winnerAmount);

      // ✅ PAY ADMIN
      await adminCredit(adminFee);

      // ✅ MARK COMPLETE
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          winnerId: g.players[winnerIdx],
          payoutDone: true,
          adminFee,
          winnerAmount
        }
      );
    } catch (err) {
      console.error("PAYOUT ERROR:", err.message);
    }
  }

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);

    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId) {
      setProcessing(false);
      return;
    }

    const card = g.hands[myIdx][i];
    if (!card) {
      setProcessing(false);
      return;
    }

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

    let nextTurn = g.players[oppIdx];

    // RULES
    if (current.number === 2) {
      g.pendingPick += 2;
      g.history.push("🔥 PICK 2");
    } else if (current.number === 8) {
      nextTurn = userId;
      g.history.push("⛔ SUSPEND");
    } else if (current.number === 1) {
      nextTurn = userId;
      g.history.push("🔁 HOLD");
    } else if (current.number === 14) {
      g.pendingPick += 1;
      nextTurn = userId;
      g.history.push("🛒 MARKET");
    } else {
      g.history.push(`${current.shape} ${current.number}`);
    }

    // WIN
    if (g.hands[myIdx].length === 0) {
      g.scores[myIdx]++;

      if (g.scores[myIdx] >= 2) {
        await handlePayout(g, myIdx);
        setProcessing(false);
        return;
      }
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

    setProcessing(false);
  }

  // =========================
  // DRAW
  // =========================
  async function drawMarket() {
    if (processing) return;
    setProcessing(true);

    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId) {
      setProcessing(false);
      return;
    }

    let count = g.pendingPick || 1;

    for (let i = 0; i < count; i++) {
      if (!g.deck.length) break;
      g.hands[myIdx].push(g.deck.pop());
    }

    g.pendingPick = 0;
    g.history.push(`📦 Drew ${count}`);

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
      {showWin && <div style={styles.win}>🏆 WINNER!</div>}

      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        <p>
          {game.turn === userId
            ? "🟢 YOUR TURN"
            : "⏳ OPPONENT"}
        </p>

        <p>
          Top: {top?.shape} {top?.number}
        </p>

        <button onClick={drawMarket}>
          MARKET ({game.deck.length})
        </button>

        <div style={styles.hand}>
          {hand.map((c, i) => {
            const d = decodeCard(c);
            return (
              <button key={i} onClick={() => playCard(i)}>
                {d.shape} {d.number}
              </button>
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
// STYLES (UNCHANGED UI)
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
    background: "#000000cc",
    padding: 12,
    color: "#fff",
    borderRadius: 10
  },
  win: {
    position: "absolute",
    top: "40%",
    background: "#000",
    color: "gold",
    padding: 20,
    fontSize: 24,
    borderRadius: 10
  },
  hand: {
    marginTop: 10
  },
  history: {
    marginTop: 10,
    maxHeight: 120,
    overflow: "auto"
  }
};