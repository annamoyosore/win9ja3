import { useEffect, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// DECODE
// =========================
function decodeCard(str) {
  if (!str) return null;

  const map = {
    c: "circle",
    t: "triangle",
    s: "square",
    x: "cross",
    r: "star"
  };

  return {
    shape: map[str[0]],
    number: Number(str.slice(1))
  };
}

// =========================
// PARSE GAME (FIXED)
// =========================
function parseGame(g) {
  return {
    ...g,
    players: JSON.parse(g.players || "[]"),
    deck: g.deck ? g.deck.split(",") : [],
    discard: g.discard || "",
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(","))
      : [[], []]
  };
}

// =========================
// ENCODE GAME
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);

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

  const pIndex = game.players.indexOf(userId);
  const oIndex = pIndex === 0 ? 1 : 0;

  const hand = game.hands[pIndex];
  const top = decodeCard(game.discard);

  async function playCard(i) {
    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId) return;

    const card = g.hands[pIndex][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape
    ) return;

    g.hands[pIndex].splice(i, 1);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        discard: card,
        turn: g.players[oIndex]
      }
    );
  }

  async function drawCard() {
    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId || !g.deck.length) return;

    const card = g.deck.pop();
    g.hands[pIndex].push(card);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        turn: g.players[oIndex]
      }
    );
  }

  return (
    <div>
      <h2>Whot Game</h2>

      <p>
        Turn: {game.turn === userId ? "You" : "Opponent"}
      </p>

      <p>
        Top: {top?.shape} {top?.number}
      </p>

      <button onClick={drawCard}>
        Draw ({game.deck.length})
      </button>

      <div>
        {hand.map((c, i) => {
          const d = decodeCard(c);
          return (
            <button key={i} onClick={() => playCard(i)}>
              {d.shape} {d.number}
            </button>
          );
        })}
      </div>

      <button onClick={goHome}>Exit</button>
    </div>
  );
}