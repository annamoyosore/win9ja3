import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// PARSE GAME
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players ? g.players.split(",").filter(Boolean) : [],
    deck: g.deck ? g.deck.split(",").filter(Boolean) : [],
    discard: g.discard || "",
    hands: g.hands
      ? g.hands.split("|").map(p =>
          p ? p.split(",").filter(Boolean) : []
        )
      : [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||") : []
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
    history: g.history.slice(-15).join("||")
  };
}

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
    shape: map[str[0]],
    number: Number(str.slice(1))
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const gameRef = useRef(null);

  // LOAD USER
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // LOAD GAME + REALTIME
  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const parsed = parseGame(g);
      setGame(parsed);
      gameRef.current = parsed;
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => {
        const parsed = parseGame(res.payload);
        setGame({ ...parsed }); // force re-render
        gameRef.current = parsed;
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId)
    return <div style={styles.center}>Loading...</div>;

  const pIndex = game.players.indexOf(userId);
  const oIndex = pIndex === 0 ? 1 : 0;

  const hand = game.hands[pIndex] || [];
  const opponentHand = game.hands[oIndex] || [];
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

      const myIdx = g.players.indexOf(userId);
      const oppIdx = myIdx === 0 ? 1 : 0;

      const card = g.hands[myIdx][i];
      if (!card) return;

      const current = decodeCard(card);
      const topDecoded = decodeCard(g.discard);

      const hasTwo = g.hands[myIdx].some(c => c.endsWith("2"));

      // 🔥 FORCE STACK RULE
      if (g.pendingPick > 0) {
        if (!hasTwo) return;
        if (current.number !== 2) return;
      }

      // NORMAL VALIDATION
      if (
        g.pendingPick === 0 &&
        current.number !== topDecoded.number &&
        current.shape !== topDecoded.shape &&
        current.number !== 14
      ) return;

      // REMOVE CARD
      g.hands[myIdx].splice(i, 1);

      let nextTurn = g.players[oppIdx];

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
        if (g.deck.length) {
          g.hands[oppIdx].push(g.deck.pop());
        }

        nextTurn = userId;
        g.history.push("General Market 🛒");
      }

      else {
        g.history.push(`${current.shape} ${current.number}`);
      }

      // WIN CHECK
      if (g.hands[myIdx].length === 0) {
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

    } finally {
      setProcessing(false);
    }
  }

  // =========================
  // DRAW MARKET
  // =========================
  async function drawMarket() {
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

      const myIdx = g.players.indexOf(userId);
      const oppIdx = myIdx === 0 ? 1 : 0;

      const hasTwo = g.hands[myIdx].some(c => c.endsWith("2"));

      // 🔥 MUST PLAY 2 IF AVAILABLE
      if (g.pendingPick > 0 && hasTwo) return;

      let count = g.pendingPick > 0 ? g.pendingPick : 1;

      for (let i = 0; i < count; i++) {
        if (!g.deck.length) break;
        g.hands[myIdx].push(g.deck.pop());
      }

      g.history.push(`Drew ${count} card(s)`);
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

    } finally {
      setProcessing(false);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <p>
          Turn: {game.turn === userId ? "🟢 You" : "⏳ Opponent"}
        </p>

        {game.pendingPick > 0 && (
          <p style={{ color: "red" }}>
            ⚠ Must play 2 or draw {game.pendingPick}
          </p>
        )}

        <div>
          Opponent Cards: {opponentHand.length}
        </div>

        <div style={styles.centerRow}>
          <div>
            Top: {top?.shape} {top?.number}
          </div>

          <button onClick={drawMarket}>
            MARKET ({game.deck.length})
          </button>
        </div>

        <div style={styles.row}>
          {hand.map((c, i) => {
            const d = decodeCard(c);
            return (
              <button
                key={i}
                style={styles.card}
                onClick={() => playCard(i)}
              >
                {d.shape} {d.number}
              </button>
            );
          })}
        </div>

        {/* HISTORY */}
        <div style={{ marginTop: 20 }}>
          <h4>Moves</h4>
          {game.history.slice().reverse().map((h, i) => (
            <div key={i}>{h}</div>
          ))}
        </div>

        <button style={styles.exit} onClick={goHome}>
          Exit
        </button>
      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  bg: {
    minHeight: "100vh",
    background: "#065f46",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  box: {
    width: 400,
    background: "#111",
    padding: 15,
    color: "#fff",
    borderRadius: 10
  },
  row: {
    display: "flex",
    gap: 5,
    flexWrap: "wrap",
    marginTop: 10
  },
  card: {
    padding: 10,
    background: "#222",
    border: "1px solid #555",
    cursor: "pointer"
  },
  centerRow: {
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between"
  },
  exit: {
    marginTop: 15,
    padding: 10,
    background: "gray",
    border: "none"
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};