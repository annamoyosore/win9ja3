// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import { databases, account, DATABASE_ID } from "./lib/appwrite";
import { payWinner } from "./lib/wallet";

const GAME_COLLECTION = "games";
const USER_COLLECTION = "users"; // 👈 must exist in Appwrite
const TURN_LIMIT = 24 * 60 * 60 * 1000;

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, stake = 0 }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then((u) => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function loadGame() {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const parsed = parseGame(g);
      setGame(parsed);

      loadOpponent(parsed);
    }

    loadGame();
  }, [gameId]);

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const parsed = parseGame(res.payload);
        setGame(parsed);
        loadOpponent(parsed);
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // PARSE GAME
  // =========================
  function parseGame(g) {
    return {
      ...g,
      deck: JSON.parse(g.deck || "[]"),
      discard: JSON.parse(g.discard || "[]"),
      hands: JSON.parse(g.hands || "[[],[]]"),
      scores: JSON.parse(g.scores || '{"p1":0,"p2":0}')
    };
  }

  // =========================
  // LOAD OPPONENT INFO
  // =========================
  async function loadOpponent(g) {
    if (!g?.players || !userId) return;

    const oppId = g.players.find((p) => p !== userId);
    if (!oppId) return;

    try {
      const user = await databases.getDocument(
        DATABASE_ID,
        USER_COLLECTION,
        oppId
      );

      setOpponent(user);
    } catch (err) {
      console.warn("Opponent load failed");
    }
  }

  // =========================
  // TIMEOUT / ABANDON
  // =========================
  useEffect(() => {
    if (!game || !userId) return;

    const interval = setInterval(async () => {
      if (game.status === "finished") return;

      const expired =
        Date.now() - new Date(game.turnStartTime).getTime() > TURN_LIMIT;

      if (!expired) return;

      // 👇 Only trigger if it's opponent's turn (they abandoned)
      if (game.turn !== userId) {
        await awardWin(userId);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [game, userId]);

  // =========================
  // SAFE WINNER PAYOUT
  // =========================
  async function awardWin(winnerId) {
    try {
      if (game.status === "finished") return;

      if (winnerId === userId) {
        await payWinner(userId, stake * 2);
      }

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          winnerId
        }
      );
    } catch (err) {
      console.error("AWARD ERROR:", err);
    }
  }

  // =========================
  // PLAY CARD (ANTI DOUBLE CLICK)
// =========================
  async function playCard(index) {
    if (loadingAction) return;
    if (!game || game.turn !== userId) return;

    setLoadingAction(true);

    try {
      const copy = JSON.parse(JSON.stringify(game));

      const playerIndex = copy.players.indexOf(userId);
      const opponentIndex = playerIndex === 0 ? 1 : 0;

      const card = copy.hands[playerIndex][index];
      const top = copy.discard.at(-1);

      if (!card || !top) return;

      if (card.number !== top.number && card.shape !== top.shape) return;

      copy.hands[playerIndex].splice(index, 1);
      copy.discard.push(card);

      // WIN ROUND
      if (copy.hands[playerIndex].length === 0) {
        await handleRoundWin(playerIndex, copy);
        return;
      }

      const next = copy.players[opponentIndex];

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          hands: JSON.stringify(copy.hands),
          discard: JSON.stringify(copy.discard),
          turn: next,
          turnStartTime: new Date().toISOString()
        }
      );
    } finally {
      setLoadingAction(false);
    }
  }

  // =========================
  // DRAW CARD
  // =========================
  async function drawCard() {
    if (loadingAction) return;
    if (!game || game.turn !== userId) return;

    setLoadingAction(true);

    try {
      const copy = JSON.parse(JSON.stringify(game));

      const playerIndex = copy.players.indexOf(userId);
      const opponentIndex = playerIndex === 0 ? 1 : 0;

      if (!copy.deck.length) return;

      copy.hands[playerIndex].push(copy.deck.pop());

      const next = copy.players[opponentIndex];

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          hands: JSON.stringify(copy.hands),
          deck: JSON.stringify(copy.deck),
          turn: next,
          turnStartTime: new Date().toISOString()
        }
      );
    } finally {
      setLoadingAction(false);
    }
  }

  // =========================
  // ROUND WIN
  // =========================
  async function handleRoundWin(playerIndex, copy) {
    const scores = copy.scores;

    if (playerIndex === 0) scores.p1++;
    else scores.p2++;

    if (scores.p1 === 2 || scores.p2 === 2) {
      const winnerId =
        scores.p1 > scores.p2
          ? copy.players[0]
          : copy.players[1];

      await awardWin(winnerId);
      return;
    }

    // NEXT ROUND RESET
    const newDeck = createDeck();

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        deck: JSON.stringify(newDeck),
        discard: JSON.stringify([newDeck.pop()]),
        hands: JSON.stringify([
          newDeck.splice(0, 6),
          newDeck.splice(0, 6)
        ]),
        scores: JSON.stringify(scores),
        round: copy.round + 1,
        turn: copy.players[0],
        turnStartTime: new Date().toISOString()
      }
    );
  }

  // =========================
  // DECK
  // =========================
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
  // UI
  // =========================
  if (!game) return <p>Loading game...</p>;

  const playerIndex = game.players.indexOf(userId);
  const hand = game.hands[playerIndex] || [];

  return (
    <div style={{ padding: 20 }}>
      <h2>🎮 WHOT Game</h2>

      {/* 👇 OPPONENT INFO */}
      {opponent && (
        <p>
          Opponent: {opponent.name || opponent.$id}{" "}
          {opponent.online ? "🟢 Online" : "⚪ Offline"}
        </p>
      )}

      <p>Round: {game.round}</p>
      <p>Score: {game.scores.p1} - {game.scores.p2}</p>

      <p>
        Turn: {game.turn === userId ? "YOUR TURN" : "Opponent"}
      </p>

      <h3>Top Card</h3>
      <pre>{JSON.stringify(game.discard.at(-1))}</pre>

      <h3>Your Cards</h3>
      {hand.map((c, i) => (
        <button
          key={i}
          disabled={loadingAction}
          onClick={() => playCard(i)}
        >
          {c.shape} {c.number}
        </button>
      ))}

      <br /><br />

      <button disabled={loadingAction} onClick={drawCard}>
        Draw Card
      </button>

      {game.status === "finished" && (
        <h1>
          {game.winnerId === userId ? "🏆 YOU WIN" : "❌ YOU LOSE"}
        </h1>
      )}
    </div>
  );
}