// =========================
// IMPORTS
// =========================
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
    shape: map[str[0]] || "circle",
    number: Number(str.slice(1)) || 0
  };
}

// =========================
// PARSE GAME (SAFE)
// =========================
function parseGame(g) {
  return {
    ...g,

    // ✅ STRING → ARRAY
    players:
      typeof g.players === "string"
        ? g.players.split(",").filter(Boolean)
        : [],

    deck:
      typeof g.deck === "string" && g.deck.length
        ? g.deck.split(",").filter(Boolean)
        : [],

    discard: g.discard || "",

    hands:
      typeof g.hands === "string" && g.hands.length
        ? g.hands.split("|").map((p) =>
            p ? p.split(",").filter(Boolean) : []
          )
        : [[], []],

    round: String(g.round || "1")
  };
}

// =========================
// ENCODE GAME (🔥 CRITICAL)
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map((p) => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    round: String(g.round)
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

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
  // GUARDS
  // =========================
  if (loading || !game || !userId) {
    return <div style={styles.center}>Loading...</div>;
  }

  if (!game.players.includes(userId)) {
    return <div style={styles.center}>Not your game</div>;
  }

  if (game.status === "finished") {
    return (
      <div style={styles.center}>
        🏆 Game Finished <br />
        Winner: {game.winnerId === userId ? "You 🎉" : "Opponent"}
        <br /><br />
        <button onClick={goHome}>Back</button>
      </div>
    );
  }

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
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      let g = parseGame(fresh);

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
          current.shape !== topDecoded.shape)
      ) return;

      // remove card
      g.hands[pIndexFresh].splice(i, 1);

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
          turn: g.players[oIndexFresh],
          turnStartTime: new Date().toISOString()
        }
      );

    } finally {
      setProcessing(false);
    }
  }

  // =========================
  // DRAW CARD
  // =========================
  async function drawCard() {
    if (processing) return;
    setProcessing(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      let g = parseGame(fresh);

      if (g.turn !== userId) return;
      if (!g.deck.length) return;

      const pIndexFresh = g.players.indexOf(userId);
      const oIndexFresh = pIndexFresh === 0 ? 1 : 0;

      const card = g.deck.pop();
      g.hands[pIndexFresh].push(card);

      // 🔥 HARD LIMIT (PREVENT SIZE ERROR)
      if (g.deck.length > 80) {
        g.deck = g.deck.slice(-80);
      }

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(g),
          turn: g.players[oIndexFresh],
          turnStartTime: new Date().toISOString()
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
    <div style={styles.container}>
      <h2>🎮 Whot Game</h2>

      <p>
        Turn: {game.turn === userId ? "🟢 You" : "⏳ Opponent"}
      </p>

      <p>
        Top Card: {top?.shape} {top?.number}
      </p>

      <button onClick={drawCard}>
        Draw ({game.deck.length})
      </button>

      <div style={{ marginTop: 20 }}>
        {hand.map((c, i) => {
          const d = decodeCard(c);
          return (
            <button
              key={i}
              onClick={() => playCard(i)}
              style={styles.card}
            >
              {d.shape} {d.number}
            </button>
          );
        })}
      </div>

      <button style={styles.exit} onClick={goHome}>
        Exit
      </button>
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
    minHeight: "100vh",
    textAlign: "center"
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    flexDirection: "column"
  },
  card: {
    margin: 5,
    padding: 10,
    background: "#222",
    color: "#fff",
    border: "1px solid #555",
    cursor: "pointer"
  },
  exit: {
    marginTop: 20,
    padding: 10,
    background: "gray",
    border: "none"
  }
};