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

function successSound() {
  beep(600, 200);
  setTimeout(() => beep(800, 200), 150);
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
// 🎴 DECODE
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
// 🎴 DRAW CARD
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
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 66, 96);

  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 14px Arial";
  ctx.fillText(card.number, 6, 18);

  const cx = 35, cy = 55;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") ctx.fillRect(cx - 12, cy - 12, 24, 24);

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.fill();
  }

  if (card.shape === "star") {
    ctx.font = "20px Arial";
    ctx.fillText("★", cx - 8, cy + 8);
  }

  if (card.shape === "cross") {
    ctx.fillRect(cx - 3, cy - 12, 6, 24);
    ctx.fillRect(cx - 12, cy - 3, 24, 6);
  }

  const img = c.toDataURL();
  cache.set(key, img);
  return img;
}

// =========================
// 🎴 BACK CARD (FIXED MISSING)
// =========================
function drawBack() {
  const c = document.createElement("canvas");
  c.width = 65;
  c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 65, 100);

  ctx.strokeStyle = "#fff";
  ctx.strokeRect(2, 2, 61, 96);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px Arial";
  ctx.fillText("🂠", 18, 60);

  return c.toDataURL();
}

// =========================
// ✅ PARSER (FIXED)
// =========================
function parseGame(g) {
  const split = (v, s) =>
    typeof v === "string" ? v.split(s).filter(Boolean) : [];

  const players = Array.isArray(g.players)
    ? g.players
    : split(g.players, ",");

  const handsRaw = split(g.hands, "|");

  const hands =
    handsRaw.length === 2
      ? handsRaw.map(p => split(p, ","))
      : [[], []];

  return {
    ...g,
    players,
    hands,
    deck: split(g.deck, ","),
    discard: g.discard || null,
    turn: g.turn || null,
    pendingPick: Number(g.pendingPick || 0),
    history: split(g.history, "||"),
    scores: split(g.scores, ",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    winnerId: g.winnerId || null,
    matchId: g.matchId || null
  };
}

// =========================
// ✅ ENCODER (FIXED)
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard || "",
    turn: g.turn,
    pendingPick: String(g.pendingPick),
    history: (g.history || []).slice(-10).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status
  };
}
//
// =========================
// 🧠 AUTO GAME RECOVERY
// =========================
function ensureGameReady(g) {
  const broken =
    !g.deck?.length ||
    !g.hands?.[0]?.length ||
    !g.hands?.[1]?.length ||
    !g.discard;

  if (!broken) return g;

  const deck = createDeck();

  return {
    ...g,
    hands: [deck.splice(0, 6), deck.splice(0, 6)],
    discard: deck.pop(),
    deck,
    pendingPick: 0,
    history: [],
    scores: [0, 0],
    round: 1,
    status: "playing"
  };
}

//
// =========================
// 📝 HISTORY (MAX 10)
// =========================
function pushHistory(g, text) {
  const updated = [...(g.history || []), text];
  return updated.slice(-10);
}

//
// =========================
// 🎯 VALID MOVE CHECK
// =========================
function isValidMove(current, top, pendingPick) {
  if (!current || !top) return false;

  // 🔥 PICK CHAIN RULE
  if (pendingPick > 0) {
    return [2, 14].includes(current.number);
  }

  // ✅ NORMAL MATCH RULE
  return (
    current.number === top.number ||
    current.shape === top.shape ||
    current.number === 14
  );
}

//
// =========================
// ⚙️ APPLY CARD EFFECT
// =========================
function applyCardEffect(g, current, myIdx, oppIdx, userId) {
  let nextTurn = g.players[oppIdx];

  // 🔥 PICK 2
  if (current.number === 2) {
    g.pendingPick += 2;
  }

  // 🔥 PICK 1 (WHOT)
  if (current.number === 14) {
    g.pendingPick += 1;
  }

  // ⛔ SUSPENSION / HOLD (1, 8)
  if (current.number === 1 || current.number === 8) {
    nextTurn = userId;
  }

  return nextTurn;
}

//
// =========================
// 🏁 ROUND + GAME END LOGIC
// =========================
async function handleRoundWin(g, myIdx, userId, gameId) {
  g.scores[myIdx]++;

  // ✅ FIRST TO 2 WINS → END GAME
  if (g.scores[myIdx] === 2) {
    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        status: "finished",
        winnerId: userId
      }
    );
    return "game-ended";
  }

  // 🔁 NEXT ROUND RESET
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

  return "next-round";
}
export default function WhotGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [showWin, setShowWin] = useState(false);
  const [ruleText, setRuleText] = useState("");

  const payoutRef = useRef(false);
  const actionLock = useRef(false);

  // =========================
  // ❌ INVALID MOVE
  // =========================
  function invalidMove(msg) {
    beep(120, 300);
    setError(msg);
    setTimeout(() => setError(""), 1200);
  }

  // =========================
  // 👤 USER LOAD
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // 🔄 LOAD + SUBSCRIBE
  // =========================
  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const fixed = ensureGameReady(parseGame(g));
      setGame(fixed);

      if (g.matchId) {
        const m = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          g.matchId
        );
        setMatch(m);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      async (res) => {
        const parsed = parseGame(res.payload);
        setGame(parsed);

        // 🎯 RULE UI TEXT
        if (parsed.pendingPick > 0) {
          setRuleText(`🔥 PICK ${parsed.pendingPick}`);
        } else if (parsed.turn === userId) {
          setRuleText("🟢 YOUR TURN");
        } else {
          setRuleText("⏳ OPPONENT TURN");
        }

        // =========================
        // 💰 PAYOUT LOGIC (MATCH POT)
        // =========================
        if (parsed.status === "finished") {

          // 🎉 WIN UI
          if (parsed.winnerId === userId) {
            setShowWin(true);
            successSound();
            setTimeout(goHome, 3000);
          } else {
            setTimeout(goHome, 2500);
          }

          // ✅ ONLY WINNER EXECUTES
          if (parsed.winnerId !== userId) return;
          if (payoutRef.current) return;
          payoutRef.current = true;

          try {
            // 🔒 LOCK GAME
            const freshGame = await databases.getDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              parsed.$id
            );

            if (freshGame.payoutDone) return;

            await databases.updateDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              parsed.$id,
              { payoutDone: true }
            );

            let pot = 0;

            // 💰 READ FROM MATCH COLLECTION
            if (parsed.matchId) {
              const freshMatch = await databases.getDocument(
                DATABASE_ID,
                MATCH_COLLECTION,
                parsed.matchId
              );

              pot = Number(freshMatch.pot || 0);

              // 🔄 RESET POT
              await databases.updateDocument(
                DATABASE_ID,
                MATCH_COLLECTION,
                parsed.matchId,
                {
                  pot: 0,
                  status: "finished"
                }
              );
            }

            if (pot <= 0) return;

            // 💰 PAY WINNER
            const wallet = await databases.listDocuments(
              DATABASE_ID,
              WALLET_COLLECTION,
              [Query.equal("userId", parsed.winnerId)]
            );

            if (wallet.documents.length) {
              const w = wallet.documents[0];

              await databases.updateDocument(
                DATABASE_ID,
                WALLET_COLLECTION,
                w.$id,
                {
                  balance: Number(w.balance || 0) + pot
                }
              );
            }

          } catch (e) {
            console.error("❌ payout error:", e);
          }
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  // =========================
  // 🛑 LOADING GUARD
  // =========================
  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;
  const top = game.discard ? decodeCard(game.discard) : null;

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  // =========================
  // 🎴 PLAY CARD
  // =========================
  async function playCard(i) {
    if (actionLock.current) return;
    if (game.turn !== userId) return invalidMove("Not your turn");

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));

    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (!isValidMove(current, topDecoded, g.pendingPick)) {
      actionLock.current = false;
      return invalidMove("Invalid move");
    }

    // remove card
    g.hands[myIdx].splice(i, 1);

    // apply effects
    const nextTurn = applyCardEffect(g, current, myIdx, oppIdx, userId);

    // history
    g.history = pushHistory(g, `${myName} played ${card}`);

    // 🏁 ROUND WIN
    if (!g.hands[myIdx].length) {
      const result = await handleRoundWin(g, myIdx, userId, gameId);
      actionLock.current = false;
      return;
    }

    // update
    setGame({ ...g, discard: card, turn: nextTurn });

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

    actionLock.current = false;
  }

  // =========================
  // 🃏 DRAW MARKET
  // =========================
  async function drawMarket() {
    if (actionLock.current) return;
    if (game.turn !== userId) return invalidMove("Wait your turn");

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));

    let count = g.pendingPick > 0 ? g.pendingPick : 1;

    g.history = pushHistory(g, `${myName} market ${count}`);

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

    actionLock.current = false;
  }
if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;
  const top = game.discard ? decodeCard(game.discard) : null;

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  async function playCard(i) {
    if (actionLock.current) return;
    if (game.turn !== userId) return invalidMove("Not your turn");

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    // 🔴 STRICT RULE: must respond to pick chain
    if (g.pendingPick > 0 && ![2, 14].includes(current.number)) {
      actionLock.current = false;
      return invalidMove(`Pick ${g.pendingPick} or play 2 / 14`);
    }

    // 🔴 NORMAL MATCH RULE
    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) {
      actionLock.current = false;
      return invalidMove("Wrong move");
    }

    g.hands[myIdx].splice(i, 1);

    let nextTurn = g.players[oppIdx];

    // 🎯 WHOT RULES
    if (current.number === 2) {
      g.pendingPick += 2;
      setRuleText(`🔥 PICK ${g.pendingPick}`);
    }

    if (current.number === 14) {
      g.pendingPick += 1;
      setRuleText(`🔥 PICK ${g.pendingPick}`);
    }

    if (current.number === 1) {
      nextTurn = userId;
      setRuleText("🔁 PLAY AGAIN");
    }

    if (current.number === 8) {
      nextTurn = userId;
      setRuleText("🚫 SUSPENSION");
    }

    // 📝 HISTORY
    g.history = pushHistory(g, `${myName} played ${card}`);

    // 🏁 ROUND WIN
    if (!g.hands[myIdx].length) {
      g.scores[myIdx]++;

      // 🎯 FIRST TO 2 → END GAME
      if (g.scores[myIdx] === 2) {
        await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
          ...encodeGame(g),
          status: "finished",
          winnerId: userId
        });
        actionLock.current = false;
        return;
      }

      // 🔄 NEXT ROUND RESET
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
    let count = g.pendingPick > 0 ? g.pendingPick : 1;

    // 📝 HISTORY
    g.history = pushHistory(g, `${myName} market ${count}`);

    for (let i = 0; i < count; i++) {
      if (!g.deck.length) break;
      g.hands[myIdx].push(g.deck.pop());
    }

    g.pendingPick = 0;

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      turn: g.players[oppIdx]
    });

    actionLock.current = false;
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>

        <h2>🎮 WHOT GAME</h2>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.row}>
          <span>{myName}</span>
          <span>VS</span>
          <span>{oppName}</span>
        </div>

        <div style={styles.ruleBox}>{ruleText}</div>

        {/* 🂠 Opponent Cards */}
        <div style={{ textAlign: "center" }}>
          {Array.from({ length: oppCards }).map((_, i) => (
            <img key={i} src={drawBack()} style={{ width: 40 }} />
          ))}
          <div>{oppName}: {oppCards}</div>
        </div>

        {/* 🎯 Score */}
        <div style={styles.row}>
          <span>Round {game.round}/3</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        {/* 💰 Pot */}
        <div style={styles.row}>
          <span>₦{match?.stake || 0}</span>
          <span>🏦 ₦{match?.pot || 0}</span>
        </div>

        {/* 🎴 Table */}
        <div style={styles.center}>
          {top && <img src={drawCard(top)} style={styles.card} />}
          <button style={styles.marketBtn} onClick={drawMarket}>
            🃏 {game.deck.length}
          </button>
        </div>

        {/* 🖐 Player Hand */}
        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(decodeCard(c))}
              style={styles.card}
              onClick={() => playCard(i)}
            />
          ))}
        </div>

        {/* 🏆 WIN POPUP */}
        {showWin && (
          <div style={styles.winBox}>
            🎉 You Won ₦{match?.pot || 0}
          </div>
        )}

        {/* 📜 HISTORY */}
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
  row: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 6
  },
  hand: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 10
  },
  card: {
    width: 65,
    cursor: "pointer"
  },
  center: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    marginTop: 10
  },
  marketBtn: {
    background: "gold",
    padding: 10,
    borderRadius: 8,
    border: "none"
  },
  history: {
    marginTop: 10,
    maxHeight: 120,
    overflow: "auto",
    fontSize: 12,
    color: "#ff4d4d"
  },
  winBox: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "gold",
    color: "#000",
    padding: 20,
    borderRadius: 10,
    fontWeight: "bold",
    zIndex: 999
  },
  error: {
    background: "red",
    padding: 6,
    textAlign: "center",
    marginBottom: 6
  },
  ruleBox: {
    textAlign: "center",
    margin: "10px 0",
    padding: 10,
    background: "#111",
    borderRadius: 8,
    fontWeight: "bold"
  }
};