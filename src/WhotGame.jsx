import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";

// =========================
// PARSE
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
// ENCODE
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick || 0),
    history: g.history.slice(-12).join("||")
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
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const gameRef = useRef(null);

  // USER
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // GAME LOAD + REALTIME
  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );
        const parsed = parseGame(g);
        setGame(parsed);
        gameRef.current = parsed;
      } catch {
        setTimeout(load, 800);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => {
        const parsed = parseGame(res.payload);
        setGame(parsed);
        gameRef.current = parsed;
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  // MATCH LOAD
  useEffect(() => {
    if (!game?.matchId) return;

    databases
      .getDocument(DATABASE_ID, MATCH_COLLECTION, game.matchId)
      .then(setMatch)
      .catch(() => {});
  }, [game]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIndex = game.players.indexOf(userId);
  const oppIndex = myIndex === 0 ? 1 : 0;

  const hand = game.hands[myIndex] || [];
  const opponentHand = game.hands[oppIndex] || [];
  const top = decodeCard(game.discard);

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return;

    const currentGame = gameRef.current;
    if (!currentGame || currentGame.turn !== userId) return;

    const cardStr = currentGame.hands[myIndex]?.[i];
    const current = decodeCard(cardStr);
    const topCard = decodeCard(currentGame.discard);

    if (!current || !topCard) return;

    // 🔥 RULE: MUST DEFEND PICK
    if (
      currentGame.pendingPick > 0 &&
      current.number !== 2
    ) {
      alert("You must respond with 2 or draw!");
      return;
    }

    const valid =
      current.number === topCard.number ||
      current.shape === topCard.shape ||
      current.number === 14;

    if (!valid) {
      alert("Invalid move");
      return;
    }

    setProcessing(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const g = parseGame(fresh);

      const card = g.hands[myIndex][i];
      const decoded = decodeCard(card);

      g.hands[myIndex].splice(i, 1);

      let nextTurn = g.players[oppIndex];

      // ================= RULES =================
      if (decoded.number === 2) {
        g.pendingPick += 2;
        g.history.push("Pick 2 🔥");
      }

      else if (decoded.number === 8) {
        nextTurn = userId;
        g.history.push("Suspension ⛔");
      }

      else if (decoded.number === 1) {
        nextTurn = userId;
        g.history.push("Hold On 🔁");
      }

      else if (decoded.number === 14) {
        g.pendingPick += 1;
        g.history.push("General Market 🛒");
      }

      else {
        g.history.push(`${decoded.shape} ${decoded.number}`);
      }

      // WIN
      if (g.hands[myIndex].length === 0) {
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

    const currentGame = gameRef.current;
    if (!currentGame || currentGame.turn !== userId) return;

    setProcessing(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const g = parseGame(fresh);

      let count = g.pendingPick || 1;

      // 🔥 FIX: recycle deck
      if (!g.deck.length && g.discard) {
        g.deck = [g.discard];
      }

      for (let i = 0; i < count; i++) {
        if (!g.deck.length) break;
        g.hands[myIndex].push(g.deck.pop());
      }

      g.pendingPick = 0;
      g.history.push(`Drew ${count}`);

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(g),
          turn: g.players[oppIndex]
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

        {match && (
          <div style={styles.info}>
            💰 ₦{match.stake} | 🏆 ₦{match.pot}
          </div>
        )}

        <p>
          Turn: {game.turn === userId ? "🟢 You" : "⏳ Opponent"}
        </p>

        {/* OPPONENT */}
        <div>
          Opponent: {opponentHand.length}
          <div style={styles.row}>
            {opponentHand.map((_, i) => (
              <div key={i} style={styles.back}></div>
            ))}
          </div>
        </div>

        {/* CENTER */}
        <div style={styles.centerRow}>
          {top && (
            <div style={styles.top}>
              {top.shape} {top.number}
            </div>
          )}

          <button onClick={drawMarket}>
            MARKET ({game.deck.length})
          </button>
        </div>

        {/* PLAYER */}
        <div style={styles.row}>
          {hand.map((c, i) => {
            const d = decodeCard(c);
            return (
              <button
                key={i}
                onClick={() => playCard(i)}
                disabled={game.turn !== userId}
              >
                {d.shape} {d.number}
              </button>
            );
          })}
        </div>

        {/* HISTORY */}
        <div style={{ marginTop: 15 }}>
          <h4>Moves</h4>
          {game.history.slice().reverse().map((h, i) => (
            <div key={i}>{h}</div>
          ))}
        </div>

        <button onClick={goHome}>Exit</button>
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
    background: "green",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  box: {
    width: 400,
    background: "#0008",
    padding: 15,
    color: "#fff"
  },
  row: {
    display: "flex",
    gap: 5,
    justifyContent: "center"
  },
  back: {
    width: 30,
    height: 45,
    background: "#222"
  },
  centerRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    margin: "10px 0"
  },
  info: {
    background: "#111",
    padding: 8,
    marginBottom: 10
  },
  top: {
    background: "#fff",
    color: "#000",
    padding: 10
  }
};