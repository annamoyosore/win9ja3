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

// 🔊 SOUND
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

// 🎴 DECK
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

// 🎴 DECODE
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

function cardLabel(cardStr) {
  const c = decodeCard(cardStr);
  if (!c) return "";

  const shapeMap = {
    circle: "●",
    triangle: "▲",
    square: "■",
    star: "★",
    cross: "✚"
  };

  return `${shapeMap[c.shape]} ${c.number}`;
}

// 🧠 HISTORY (MAX 10)
function addHistory(g, text) {
  const h = [...(g.history || [])];
  h.push(text);
  return h.length > 10 ? h.slice(-10) : h;
}
// PARSER
function parseGame(g) {
  const safeSplit = (v, sep) =>
    typeof v === "string" ? v.split(sep).filter(Boolean) : [];

  const players = Array.isArray(g.players)
    ? g.players
    : safeSplit(g.players, ",");

  const handsRaw = safeSplit(g.hands, "|");

  const hands =
    handsRaw.length === 2
      ? handsRaw.map(p => safeSplit(p, ","))
      : [[], []];

  return {
    ...g,
    players,
    hands,
    deck: safeSplit(g.deck, ","),
    discard: g.discard || null,
    turn: g.turn || null,
    pendingPick: Number(g.pendingPick || 0),
    history: safeSplit(g.history, "||"),
    scores: safeSplit(g.scores, ",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    winnerId: g.winnerId || null,
    matchId: g.matchId || null
  };
}

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

// 🔥 END ROUND (FIRST TO 2 WINS)
async function endRound(g, winnerIdx, gameId) {
  g = JSON.parse(JSON.stringify(g));
  g.scores[winnerIdx]++;

  if (g.scores[winnerIdx] === 2) {
    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        status: "finished",
        winnerId: g.players[winnerIdx]
      }
    );
    return;
  }

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
export default function WhotGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showWin, setShowWin] = useState(null);
  const [error, setError] = useState("");

  const payoutRef = useRef(false);
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

        // 🔥 WIN / LOSE POPUP
        if (parsed.status === "finished") {
          if (parsed.winnerId === userId) {
            setShowWin("win");
          } else {
            setShowWin("lose");
          }

          setTimeout(goHome, 3000);

          // 💰 PAYOUT FROM MATCH POT
          if (parsed.winnerId !== userId) return;
          if (payoutRef.current) return;
          payoutRef.current = true;

          try {
            const matchDoc = await databases.getDocument(
              DATABASE_ID,
              MATCH_COLLECTION,
              parsed.matchId
            );

            if (parsed.payoutDone) return;

            const pot = Number(matchDoc.pot || 0);
            if (pot <= 0) return;

            // mark paid
            await databases.updateDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              parsed.$id,
              { payoutDone: true }
            );

            // clear pot
            await databases.updateDocument(
              DATABASE_ID,
              MATCH_COLLECTION,
              parsed.matchId,
              { pot: 0, status: "finished" }
            );

            // pay winner
            const winnerWallet = await databases.listDocuments(
              DATABASE_ID,
              WALLET_COLLECTION,
              [Query.equal("userId", parsed.winnerId)]
            );

            if (winnerWallet.documents.length) {
              const w = winnerWallet.documents[0];
              await databases.updateDocument(
                DATABASE_ID,
                WALLET_COLLECTION,
                w.$id,
                { balance: Number(w.balance || 0) + pot }
              );
            }

          } catch (e) {
            console.error("PAYOUT ERROR", e);
          }
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;
  const top = decodeCard(game.discard);

  async function playCard(i) {
    if (actionLock.current) return;
    if (game.turn !== userId) return invalidMove("Not your turn");

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (!topDecoded) return;

    if (g.pendingPick > 0 && ![2,14].includes(current.number)) {
      actionLock.current = false;
      return invalidMove("Respond with 2 or 14");
    }

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) {
      actionLock.current = false;
      return invalidMove("Wrong card");
    }

    const name = myIdx === 0 ? g.hostName : g.opponentName;

    g.history = addHistory(g, `${name} played ${cardLabel(card)}`);

    if (current.number === 2)
      g.history = addHistory(g, `${name} gave +2`);

    if (current.number === 14)
      g.history = addHistory(g, `${name} gave +1`);

    if (current.number === 1 || current.number === 8)
      g.history = addHistory(g, `${name} plays again`);

    g.hands[myIdx].splice(i, 1);

    let nextTurn = g.players[oppIdx];

    if (current.number === 2) g.pendingPick += 2;
    if (current.number === 14) g.pendingPick += 1;
    if (current.number === 1 || current.number === 8) nextTurn = userId;

    if (!g.hands[myIdx].length) {
      await endRound(g, myIdx, gameId);
      actionLock.current = false;
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

    actionLock.current = false;
  }

  async function drawMarket() {
    if (actionLock.current) return;
    if (game.turn !== userId) return invalidMove("Wait your turn");

    actionLock.current = true;

    const g = JSON.parse(JSON.stringify(game));
    let count = g.pendingPick > 0 ? g.pendingPick : 1;

    for (let i = 0; i < count; i++) {
      if (!g.deck.length) break;
      g.hands[myIdx].push(g.deck.pop());
    }

    const name = myIdx === 0 ? g.hostName : g.opponentName;
    g.history = addHistory(g, `${name} drew ${count} card(s)`);

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

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <h2>WHOT</h2>

      <p>Opponent cards: {oppCards}</p>
      <p>🏦 Pot: ₦{match?.pot || 0}</p>

      {top && <img src={drawCard(top)} width={70} />}

      <div>
        {hand.map((c, i) => (
          <img
            key={i}
            src={drawCard(decodeCard(c))}
            width={60}
            onClick={() => playCard(i)}
          />
        ))}
      </div>

      <button onClick={drawMarket}>Draw</button>

      {showWin === "win" && <h2>🎉 YOU WON ₦{match?.pot || 0}</h2>}
      {showWin === "lose" && <h2>❌ YOU LOST</h2>}

      <div>
        {game.history.map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>
    </div>
  );
}