import { useEffect, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// DECODE CARD
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

    // ✅ FIX: NO JSON.parse
    players: g.players
      ? g.players.split(",").filter(Boolean)
      : [],

    deck: g.deck
      ? g.deck.split(",").filter(Boolean)
      : [],

    discard: g.discard || "",

    hands: g.hands
      ? g.hands.split("|").map(p =>
          p ? p.split(",").filter(Boolean) : []
        )
      : [[], []],

    pendingPick: Number(g.pendingPick || 0),

    history: g.history
      ? g.history.split("||")
      : []
  };
}

// =========================
// ENCODE GAME
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick || 0),

    // keep last 10 moves
    history: g.history.slice(-10).join("||")
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

  if (!game || !userId) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  if (!game.players.includes(userId)) {
    return <div style={{ padding: 20 }}>Not your game</div>;
  }

  const pIndex = game.players.indexOf(userId);
  const oIndex = pIndex === 0 ? 1 : 0;

  const hand = game.hands[pIndex] || [];
  const top = decodeCard(game.discard);

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

    const pIndexFresh = g.players.indexOf(userId);
    const oIndexFresh = pIndexFresh === 0 ? 1 : 0;

    const card = g.hands[pIndexFresh][i];
    if (!card) return;

    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (
      !topDecoded ||
      (current.number !== topDecoded.number &&
        current.shape !== topDecoded.shape &&
        current.number !== 14)
    ) return;

    // remove card
    g.hands[pIndexFresh].splice(i, 1);

    let nextTurn = g.players[oIndexFresh];

    // =========================
    // RULES
    // =========================
    if (current.number === 2) {
      g.pendingPick += 2;
      g.history.push("Pick 2 🔥");
    }

    else if (current.number === 8) {
      nextTurn = userId;
      g.history.push("Suspension ⛔");
    }

    else if (current.number === 1) {
      nextTurn = userId;
      g.history.push("Hold On 🔁");
    }

    else if (current.number === 14) {
      g.pendingPick += 1;
      g.history.push("General Market 🛒");
    }

    else {
      g.history.push(`${current.shape} ${current.number}`);
    }

    // WIN
    if (g.hands[pIndexFresh].length === 0) {
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(g),
          discard: card,
          status: "finished",
          winnerId: userId
        }
      );
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

    const pIndexFresh = g.players.indexOf(userId);
    const oIndexFresh = pIndexFresh === 0 ? 1 : 0;

    let drawCount = g.pendingPick || 1;

    for (let i = 0; i < drawCount; i++) {
      if (!g.deck.length) break;

      const card = g.deck.pop();
      g.hands[pIndexFresh].push(card);
    }

    g.history.push(`Drew ${drawCount}`);
    g.pendingPick = 0;

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        turn: g.players[oIndexFresh]
      }
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={{ padding: 20 }}>
      <h2>🎮 Whot Game</h2>

      <p>
        Turn: {game.turn === userId ? "🟢 You" : "⏳ Opponent"}
      </p>

      <p>
        Top: {top?.shape} {top?.number}
      </p>

      <button onClick={drawCard}>
        Draw ({game.deck.length})
      </button>

      <div style={{ marginTop: 20 }}>
        {hand.map((c, i) => {
          const d = decodeCard(c);
          return (
            <button key={i} onClick={() => playCard(i)}>
              {d.shape} {d.number}
            </button>
          );
        })}
      </div>

      {/* HISTORY */}
      <div style={{ marginTop: 30 }}>
        <h3>📜 Moves</h3>
        {game.history.slice().reverse().map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>

      <button onClick={goHome}>Exit</button>
    </div>
  );
}