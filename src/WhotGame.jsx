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

const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// 🔊 SOUND
// =========================
function beep(freq = 400, duration = 120) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "square";

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
  } catch {}
}

// =========================
// 🎴 VALID DECK
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
// PARSE / ENCODE
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players?.split(",") || [],
    deck: g.deck?.split(",").filter(Boolean) || [],
    hands: g.hands?.split("|").map(p => p.split(",").filter(Boolean)) || [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history?.split("||").filter(Boolean) || [],
    scores: g.scores?.split(",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    payoutDone: Boolean(g.payoutDone)
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick),
    history: g.history.slice(-20).join("||"),
    scores: g.scores.join(","),
    round: String(g.round)
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const payoutRef = useRef(false);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      const parsed = parseGame(g);
      setGame(parsed);

      if (g.matchId) {
        const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
        setMatch(m);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      async (res) => {
        const parsed = parseGame(res.payload);
        setGame(parsed);

        // ✅ payout trigger
        if (parsed.status === "finished" && !parsed.payoutDone && !payoutRef.current) {
          payoutRef.current = true;

          const total = Number(match?.pot || 0);
          const adminCut = total * 0.1;
          const winnerAmount = total - adminCut;

          const w = await databases.listDocuments(
            DATABASE_ID,
            WALLET_COLLECTION,
            [Query.equal("userId", parsed.winnerId)]
          );

          if (w.documents.length) {
            await databases.updateDocument(
              DATABASE_ID,
              WALLET_COLLECTION,
              w.documents[0].$id,
              { balance: Number(w.documents[0].balance || 0) + winnerAmount }
            );
          }

          await databases.updateDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            parsed.$id,
            { payoutDone: true }
          );
        }
      }
    );

    return () => unsub();
  }, [gameId, userId, match]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  // =========================
  // 🏁 ROUND CHECK
  // =========================
  async function endRound(g, winnerIdx) {
    g.scores[winnerIdx] += 1;
    g.history.push("🏆 ROUND WON");

    // ✅ MATCH END
    if (g.scores[winnerIdx] >= 2) {
      await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
        ...encodeGame(g),
        status: "finished",
        winnerId: g.players[winnerIdx]
      });
      return;
    }

    // 🔁 NEW ROUND
    const deck = createDeck();
    g.hands = [deck.splice(0, 6), deck.splice(0, 6)];
    g.discard = deck.pop();
    g.deck = deck;
    g.pendingPick = 0;
    g.round += 1;

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, encodeGame(g));
  }

  // =========================
  // 🎴 PLAY CARD
  // =========================
  async function playCard(i) {
    const g = parseGame(await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId));
    if (g.turn !== userId) return;

    const card = g.hands[myIdx][i];
    g.hands[myIdx].splice(i, 1);

    // ✅ ONLY RULE: LAST CARD ENDS ROUND
    if (g.hands[myIdx].length === 0) {
      await endRound(g, myIdx);
      return;
    }

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      discard: card,
      turn: g.players[oppIdx]
    });
  }

  // =========================
  // 🃏 DRAW MARKET
  // =========================
  async function drawMarket() {
    const g = parseGame(await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId));
    if (g.turn !== userId) return;

    if (!g.deck.length) {
      // ✅ MARKET EMPTY → decide winner
      const myCards = g.hands[myIdx].length;
      const oppCards = g.hands[oppIdx].length;

      if (myCards !== oppCards) {
        const winner = myCards < oppCards ? myIdx : oppIdx;
        await endRound(g, winner);
      }

      return;
    }

    g.hands[myIdx].push(g.deck.pop());

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      turn: g.players[oppIdx]
    });
  }

  return <div style={{color:"#fff"}}>Game Running...</div>;
}