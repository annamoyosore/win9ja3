// =========================
// IMPORTS
// =========================
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
    r: "star",
    x: "cross"
  };

  return {
    shape: map[str[0]] || "circle",
    number: Number(str.slice(1)) || 0
  };
}

// =========================
// SAFE PARSE (VERY IMPORTANT)
// =========================
function parseGame(g) {
  return {
    ...g,

    // support BOTH string + JSON
    players:
      typeof g.players === "string"
        ? (g.players.startsWith("[")
            ? JSON.parse(g.players)
            : g.players.split(",").filter(Boolean))
        : [],

    deck:
      typeof g.deck === "string"
        ? g.deck.split(",").filter(Boolean)
        : [],

    hands:
      typeof g.hands === "string"
        ? g.hands.split("|").map(p =>
            p ? p.split(",").filter(Boolean) : []
          )
        : [[], []],

    discard: g.discard || "",
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||") : []
  };
}

// =========================
// ENCODE (ALWAYS STRING)
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick || 0),
    history: g.history.join("||")
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME + REALTIME
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

        // wait until both players exist
        if (!parsed.players || parsed.players.length < 2) {
          retry = setTimeout(load, 500);
          return;
        }

        setGame(parsed);
      } catch {
        retry = setTimeout(load, 800);
      }
    }

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => setGame(parseGame(res.payload))
    );

    return () => {
      unsub();
      clearTimeout(retry);
    };
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  // =========================
  // PLAYER INDEX
  // =========================
  const pIndex = game.players.indexOf(userId);
  const oIndex = pIndex === 0 ? 1 : 0;

  const hand = game.hands[pIndex] || [];
  const top = decodeCard(game.discard);

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);

    try {
      const fresh = parseGame(
        await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        )
      );

      if (fresh.turn !== userId) return;

      const pIdx = fresh.players.indexOf(userId);
      const oIdx = pIdx === 0 ? 1 : 0;

      const card = fresh.hands[pIdx][i];
      if (!card) return;

      const current = decodeCard(card);
      const topDecoded = decodeCard(fresh.discard);

      // VALIDATION
      if (
        current.number !== 14 &&
        current.number !== topDecoded?.number &&
        current.shape !== topDecoded?.shape
      ) return;

      // REMOVE CARD
      fresh.hands[pIdx].splice(i, 1);

      let nextTurn = fresh.players[oIdx];

      // =========================
      // RULES ENGINE
      // =========================
      if (current.number === 2) {
        fresh.pendingPick += 2;
        fresh.history.push("🔥 PICK 2");
      }

      else if (current.number === 8) {
        nextTurn = userId;
        fresh.history.push("⛔ SUSPENSION");
      }

      else if (current.number === 1) {
        nextTurn = userId;
        fresh.history.push("🔁 HOLD ON");
      }

      else if (current.number === 14) {
        fresh.pendingPick += 1;
        nextTurn = userId;
        fresh.history.push("🛒 GENERAL MARKET");
      }

      else {
        fresh.history.push(`${current.shape} ${current.number}`);
      }

      // WIN
      if (fresh.hands[pIdx].length === 0) {
        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          {
            ...encodeGame(fresh),
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
          ...encodeGame(fresh),
          discard: card,
          turn: nextTurn
        }
      );

    } finally {
      setProcessing(false);
    }
  }

  // =========================
  // DRAW (RULE ENFORCED)
// =========================
  async function drawCard() {
    if (processing) return;
    setProcessing(true);

    try {
      const fresh = parseGame(
        await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        )
      );

      if (fresh.turn !== userId) return;

      const pIdx = fresh.players.indexOf(userId);
      const oIdx = pIdx === 0 ? 1 : 0;

      let count = fresh.pendingPick || 1;

      for (let i = 0; i < count; i++) {
        if (!fresh.deck.length) break;

        const card = fresh.deck.pop();
        fresh.hands[pIdx].push(card);
      }

      fresh.history.push(`📦 Drew ${count}`);
      fresh.pendingPick = 0;

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(fresh),
          turn: fresh.players[oIdx]
        }
      );

    } finally {
      setProcessing(false);
    }
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
        🃏 Draw ({game.deck.length})
      </button>

      <div style={{ marginTop: 20 }}>
        {hand.map((c, i) => {
          const d = decodeCard(c);
          return (
            <button
              key={i}
              onClick={() => playCard(i)}
              style={{ margin: 5 }}
            >
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