import { useEffect, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// CARD ENCODE / DECODE
// =========================
function encodeCard(c) {
  return c.shape[0] + c.number;
}

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
// PARSE GAME (COMPRESSED)
// =========================
function parseGame(g) {
  return {
    ...g,
    deck: g.deck ? g.deck.split(",") : [],
    discard: g.discard ? decodeCard(g.discard) : null,
    hands: g.hands
      ? g.hands.split("|").map(p => p ? p.split(",") : [])
      : [[], []]
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId || !userId) return;

    let retry;

    async function load() {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );

        const parsed = parseGame(g);

        if (!parsed.players || parsed.players.length < 2) {
          retry = setTimeout(load, 500);
          return;
        }

        setGame(parsed);
        setLoading(false);

      } catch {
        retry = setTimeout(load, 800);
      }
    }

    load();
    return () => clearTimeout(retry);
  }, [gameId, userId]);

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        setGame(parseGame(res.payload));
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // SAFE GUARD
  // =========================
  if (loading || !game || !userId) {
    return <div style={styles.center}>Loading...</div>;
  }

  if (!game.players.includes(userId)) {
    return <div style={styles.center}>Not your game</div>;
  }

  const pIndex = game.players.indexOf(userId);
  const oIndex = pIndex === 0 ? 1 : 0;

  const hand = game.hands[pIndex];
  const top = game.discard;

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId
    );

    const g = parseGame(fresh);

    if (g.turn !== userId) return;

    const card = g.hands[pIndex][i];
    const top = g.discard;

    const decoded = decodeCard(card);

    if (
      decoded.number !== top.number &&
      decoded.shape !== top.shape
    ) return;

    g.hands[pIndex].splice(i, 1);

    const newTop = card;

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        hands: g.hands.map(p => p.join(",")).join("|"),
        discard: newTop,
        turn: g.players[oIndex]
      }
    );
  }

  // =========================
  // DRAW CARD
  // =========================
  async function drawCard() {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId
    );

    const g = parseGame(fresh);

    if (g.turn !== userId) return;
    if (!g.deck.length) return;

    const card = g.deck.pop();
    g.hands[pIndex].push(card);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        deck: g.deck.join(","),
        hands: g.hands.map(p => p.join(",")).join("|"),
        turn: g.players[oIndex]
      }
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>Game</h2>

      <p>Top Card: {top?.shape} {top?.number}</p>

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

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    color: "#fff",
    background: "#111",
    minHeight: "100vh"
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};