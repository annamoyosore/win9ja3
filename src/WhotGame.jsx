import { useEffect, useState } from "react";
import { databases, account, DATABASE_ID } from "./lib/appwrite";
import { getWallet, updateBalance } from "./lib/wallet";

const GAME_COLLECTION = "games";
const TURN_LIMIT = 24 * 60 * 60 * 1000; // 24 hours

// =========================
// HELPERS
// =========================
function isExpired(turnStartTime) {
  return Date.now() - new Date(turnStartTime).getTime() > TURN_LIMIT;
}

function createDeck() {
  const shapes = ["circle", "triangle", "square", "star", "cross"];
  const deck = [];

  for (const shape of shapes) {
    for (let i = 1; i <= 13; i++) {
      if (i === 6 || i === 9) continue;
      deck.push({ shape, number: i });
    }
    deck.push({ shape, number: 14 });
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, stake = 0 }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // REALTIME SUBSCRIBE
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const g = res.payload;

        setGame({
          ...g,
          deck: JSON.parse(g.deck),
          discard: JSON.parse(g.discard),
          hands: JSON.parse(g.hands),
          scores: JSON.parse(g.scores)
        });
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // TIMEOUT CHECK
  // =========================
  useEffect(() => {
    if (!game || !userId) return;

    const interval = setInterval(async () => {
      if (game.status === "finished") return;

      if (isExpired(game.turnStartTime)) {
        if (game.turn !== userId) return;

        await handleTimeout(game);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [game, userId]);

  // =========================
  // TIMEOUT HANDLER
  // =========================
  async function handleTimeout(g) {
    const hands = g.hands;

    const p1 = hands[0].length;
    const p2 = hands[1].length;

    let winnerId = null;

    if (p1 < p2) winnerId = g.players[0];
    else if (p2 < p1) winnerId = g.players[1];

    // 💰 reward winner
    if (winnerId === userId) {
      const wallet = await getWallet(userId);
      await updateBalance(wallet.$id, wallet.balance + stake * 2);
    }

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      g.$id,
      {
        status: "finished",
        winnerId: winnerId || ""
      }
    );
  }

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(cardIndex) {
    if (!game || game.turn !== userId) return;

    const copy = JSON.parse(JSON.stringify(game));

    const playerIndex = copy.players.indexOf(userId);
    const opponentIndex = playerIndex === 0 ? 1 : 0;

    const card = copy.hands[playerIndex][cardIndex];

    const top = copy.discard.at(-1);

    if (card.number !== top.number && card.shape !== top.shape) return;

    copy.hands[playerIndex].splice(cardIndex, 1);
    copy.discard.push(card);

    // check win
    if (copy.hands[playerIndex].length === 0) {
      await handleRoundWin(playerIndex, copy);
      return;
    }

    const nextPlayer = copy.players[opponentIndex];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        hands: JSON.stringify(copy.hands),
        discard: JSON.stringify(copy.discard),
        turn: nextPlayer,
        turnStartTime: new Date().toISOString()
      }
    );
  }

  // =========================
  // DRAW CARD
  // =========================
  async function drawCard() {
    if (!game || game.turn !== userId) return;

    const copy = JSON.parse(JSON.stringify(game));

    const playerIndex = copy.players.indexOf(userId);
    const opponentIndex = playerIndex === 0 ? 1 : 0;

    copy.hands[playerIndex].push(copy.deck.pop());

    const nextPlayer = copy.players[opponentIndex];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        hands: JSON.stringify(copy.hands),
        deck: JSON.stringify(copy.deck),
        turn: nextPlayer,
        turnStartTime: new Date().toISOString()
      }
    );
  }

  // =========================
  // ROUND WIN (3 ROUNDS SYSTEM)
  // =========================
  async function handleRoundWin(playerIndex, copy) {
    const scores = copy.scores;

    if (playerIndex === 0) scores.p1++;
    else scores.p2++;

    // match winner
    if (scores.p1 === 2 || scores.p2 === 2) {
      const winnerId = scores.p1 > scores.p2
        ? copy.players[0]
        : copy.players[1];

      if (winnerId === userId) {
        const wallet = await getWallet(userId);
        await updateBalance(wallet.$id, wallet.balance + stake * 2);
      }

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          scores: JSON.stringify(scores),
          winnerId
        }
      );

      return;
    }

    // next round
    const deck = createDeck();

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        deck: JSON.stringify(deck),
        discard: JSON.stringify([deck.pop()]),
        hands: JSON.stringify([
          deck.splice(0, 6),
          deck.splice(0, 6)
        ]),
        scores: JSON.stringify(scores),
        round: copy.round + 1,
        turn: copy.players[0],
        turnStartTime: new Date().toISOString()
      }
    );
  }

  // =========================
  // UI
  // =========================
  if (!game) return <p>Loading game...</p>;

  const playerIndex = game.players.indexOf(userId);
  const hand = game.hands[playerIndex] || [];

  return (
    <div style={{ padding: 20 }}>
      <h2>🎮 Multiplayer WHOT</h2>

      <p>Round: {game.round}</p>
      <p>Score: {game.scores.p1} - {game.scores.p2}</p>

      <p>
        Turn: {game.turn === userId ? "YOUR TURN" : "Opponent"}
      </p>

      <h3>Top Card</h3>
      <pre>{JSON.stringify(game.discard.at(-1))}</pre>

      <h3>Your Cards</h3>
      {hand.map((c, i) => (
        <button key={i} onClick={() => playCard(i)}>
          {c.shape} {c.number}
        </button>
      ))}

      <br /><br />

      <button onClick={drawCard}>Draw Card</button>

      {game.status === "finished" && (
        <h1>
          {game.winnerId === userId ? "🏆 YOU WIN" : "❌ YOU LOSE"}
        </h1>
      )}
    </div>
  );
}