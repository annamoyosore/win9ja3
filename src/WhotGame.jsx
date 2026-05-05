import { useEffect, useRef, useState } from "react";
import Messages from "./Messages";
import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";
const MESSAGE_COLLECTION = "messages";

// =========================
// 🔊 SOUND
// =========================
function beep(freq = 200, duration = 200) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

// =========================
// 🎮 RULE ENGINE
// =========================
function canPlay(card, top, currentShape, pendingPick) {
  if (pendingPick > 0) return card.number === 2;
  if (card.number === 14) return true;
  return card.number === top.number || card.shape === (currentShape || top.shape);
}

function nextTurn(game, idx, skip = false) {
  if (skip) return game.players[idx];
  return game.players[idx === 0 ? 1 : 0];
}

// =========================
// PARSERS
// =========================
function parseGame(g) {
  const players = (g.players || "").split(",").filter(Boolean);
  const deck = (g.deck || "").split(",").filter(Boolean);
  const hands = (g.hands || "").split("|").map(p => p.split(",").filter(Boolean));

  return {
    ...g,
    players,
    hands,
    deck,
    discard: g.discard || deck[0],
    currentShape: g.currentShape || null,
    turn: g.turn || players[0],
    pendingPick: Number(g.pendingPick || 0),
    payoutDone: Boolean(g.payoutDone),
    status: g.status || "playing",
    matchId: g.matchId
  };
}

function parseMatch(m) {
  return {
    ...m,
    pot: Number(m.pot ?? m.amount ?? m.betAmount ?? 0)
  };
}
export default function WhotGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    let unsubGame, unsubMatch;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      const parsed = parseGame(g);
      setGame(parsed);

      if (g.matchId) {
        const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
        setMatch(parseMatch(m));

        unsubMatch = databases.client.subscribe(
          `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents.${g.matchId}`,
          res => setMatch(parseMatch(res.payload))
        );
      }
    };

    load();

    unsubGame = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => setGame(parseGame(res.payload))
    );

    return () => {
      unsubGame && unsubGame();
      unsubMatch && unsubMatch();
    };
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const pot = match?.pot || 0;

  // =========================
  // 🎴 PLAY CARD
  // =========================
  const playCard = async (cardStr) => {
    if (game.turn !== userId) return;

    const card = decodeCard(cardStr);
    const top = decodeCard(game.discard);

    if (!canPlay(card, top, game.currentShape, game.pendingPick)) return;

    let newHands = [...game.hands];
    newHands[myIdx] = newHands[myIdx].filter(c => c !== cardStr);

    let pending = game.pendingPick;
    let skip = false;
    let shape = null;

    if (card.number === 2) pending += 2;
    if (card.number === 8) skip = true;
    if (card.number === 14) shape = prompt("Choose shape");

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        hands: newHands.map(h => h.join(",")).join("|"),
        discard: cardStr,
        currentShape: shape,
        pendingPick: pending,
        turn: nextTurn(game, myIdx, skip)
      }
    );
  };

  // =========================
  // 🃏 PICK CARD
  // =========================
  const pickCard = async () => {
    if (game.turn !== userId) return;

    let draw = game.pendingPick || 1;
    let deck = [...game.deck];
    let hands = [...game.hands];

    let drawn = deck.splice(0, draw);
    hands[myIdx] = [...hands[myIdx], ...drawn];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        deck,
        hands: hands.map(h => h.join(",")).join("|"),
        pendingPick: 0,
        turn: game.players[oppIdx]
      }
    );
  };

  // =========================
  // 💰 PAYOUT
  // =========================
  useEffect(() => {
    if (!game || game.payoutDone) return;

    const myHand = game.hands[myIdx] || [];
    const oppHand = game.hands[oppIdx] || [];

    let winnerId = null;
    if (myHand.length === 0) winnerId = userId;
    if (oppHand.length === 0) winnerId = game.players[oppIdx];

    if (!winnerId || !pot) return;

    const pay = async () => {
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", winnerId)]
      );

      const wallet = res.documents[0];

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: Number(wallet.balance) + pot }
      );

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          payoutDone: true,
          winnerId,
          status: "finished"
        }
      );
    };

    pay();
  }, [game]);

  // =========================
  // 🧹 DELETE MESSAGES
  // =========================
  useEffect(() => {
    if (game.status !== "finished") return;
    if (userId !== game.players[0]) return;

    const clear = async () => {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MESSAGE_COLLECTION,
        [Query.equal("gameId", gameId)]
      );

      await Promise.all(
        res.documents.map(m =>
          databases.deleteDocument(DATABASE_ID, MESSAGE_COLLECTION, m.$id)
        )
      );
    };

    clear();
  }, [game.status]);
return (
    <div style={styles.bg}>
      <button onClick={() => setShowChat(true)} style={styles.chatBtn}>💬</button>

      <div style={styles.box}>
        <div>Pot: ₦{pot}</div>

        <button onClick={pickCard}>🃏 {game.deck.length}</button>

        <div style={styles.hand}>
          {game.hands[myIdx].map((c, i) => (
            <img
              key={i}
              src={drawCard(decodeCard(c))}
              onClick={() => playCard(c)}
              style={styles.card}
            />
          ))}
        </div>
      </div>

      {showChat && (
        <Messages
          gameId={gameId}
          userId={userId}
          game={game}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}