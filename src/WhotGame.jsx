import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// PARSE
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players ? g.players.split(",") : [],
    deck: g.deck ? g.deck.split(",").filter(Boolean) : [],
    hands: g.hands
      ? g.hands.split("|").map(p => p.split(",").filter(Boolean))
      : [[], []],
    history: g.history ? g.history.split("||") : [],
    scores: g.scores ? g.scores.split(",").map(Number) : [0, 0],
    pendingPick: Number(g.pendingPick || 0),
    round: Number(g.round || 1)
  };
}

// =========================
// ENCODE
// =========================
function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    history: g.history.slice(-20).join("||"), // 🔥 limit
    pendingPick: String(g.pendingPick),
    scores: g.scores.join(","),
    round: String(g.round)
  };
}

// =========================
// CARD
// =========================
function decodeCard(str) {
  if (!str) return null;
  return {
    shape: str[0],
    number: Number(str.slice(1))
  };
}

// =========================
// SCORE VALUE
// =========================
function cardValue(card) {
  const n = Number(card.slice(1));
  if (n === 14) return 14;
  if (n >= 10) return 10;
  return n;
}

function handValue(hand) {
  return hand.reduce((sum, c) => sum + cardValue(c), 0);
}

// =========================
// SOUND
// =========================
function playSound(type) {
  const src =
    type === "win" ? "/sounds/win.mp3" : "/sounds/play.mp3";
  const a = new Audio(src);
  a.play().catch(() => {});
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const gameRef = useRef(null);

  // =========================
  // INIT
  // =========================
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
      const parsed = parseGame(g);
      setGame(parsed);
      gameRef.current = parsed;
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

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const opponentHand = game.hands[oppIdx];
  const top = decodeCard(game.discard);

  // =========================
  // END ROUND
  // =========================
  async function endRound(g, winnerIdx) {
    g.scores[winnerIdx]++;
    g.history = [`R${g.round}:WIN P${winnerIdx + 1}`];

    playSound("win");

    // FINAL MATCH WINNER
    if (g.scores[winnerIdx] === 2 || g.round >= 3) {
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(g),
          status: "finished",
          winnerId: g.players[winnerIdx]
        }
      );

      alert(
        winnerIdx === myIdx
          ? "🏆 YOU WON THE MATCH!"
          : "😢 YOU LOST"
      );

      return;
    }

    // NEXT ROUND RESET
    g.round += 1;

    // 🔥 CLEAR HISTORY FOR NEW ROUND
    g.history = [`R${g.round}:START`];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        status: "reset"
      }
    );
  }

  // =========================
  // PLAY
  // =========================
  async function playCard(i) {
    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId) return;

    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) return;

    g.hands[myIdx].splice(i, 1);

    g.history.push(`R${g.round}:${card}`);

    playSound("play");

    // WIN BY EMPTY HAND
    if (g.hands[myIdx].length === 0) {
      return endRound(g, myIdx);
    }

    // MARKET EMPTY CHECK
    if (!g.deck.length) {
      const p0 = handValue(g.hands[0]);
      const p1 = handValue(g.hands[1]);

      const winnerIdx =
        p0 < p1 ? 0 : p1 < p0 ? 1 : myIdx;

      return endRound(g, winnerIdx);
    }

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        discard: card,
        turn: g.players[oppIdx]
      }
    );
  }

  // =========================
  // DRAW
  // =========================
  async function draw() {
    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId) return;

    if (!g.deck.length) {
      const p0 = handValue(g.hands[0]);
      const p1 = handValue(g.hands[1]);

      const winnerIdx =
        p0 < p1 ? 0 : p1 < p0 ? 1 : myIdx;

      return endRound(g, winnerIdx);
    }

    const card = g.deck.pop();
    g.hands[myIdx].push(card);

    g.history.push(`R${g.round}:DRAW`);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      {
        ...encodeGame(g),
        turn: g.players[oppIdx]
      }
    );
  }

  // =========================
  // FINISHED UI
  // =========================
  if (game.status === "finished") {
    return (
      <div style={styles.center}>
        <h2>🏆 Game Finished</h2>
        <p>
          {game.winnerId === userId
            ? "You Won 🎉"
            : "You Lost 😢"}
        </p>
        <button onClick={goHome}>Exit</button>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <p>Round: {game.round}/3</p>
        <p>
          Score: {game.scores[myIdx]} -{" "}
          {game.scores[oppIdx]}
        </p>

        <p>
          Turn: {game.turn === userId ? "🟢 You" : "⏳ Opponent"}
        </p>

        <p>Opponent Cards: {opponentHand.length}</p>

        <p>Top: {top?.shape} {top?.number}</p>

        <button onClick={draw}>
          Market ({game.deck.length})
        </button>

        {/* HAND */}
        <div style={styles.hand}>
          {hand.map((c, i) => (
            <button key={i} onClick={() => playCard(i)}>
              {c}
            </button>
          ))}
        </div>

        {/* HISTORY */}
        <div style={styles.history}>
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
    width: "95%",
    maxWidth: 420,
    background: "#0008",
    padding: 10,
    color: "#fff"
  },
  hand: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    justifyContent: "center"
  },
  history: {
    marginTop: 15,
    maxHeight: 120,
    overflow: "auto",
    fontSize: 12
  },
  center: {
    display: "flex",
    height: "100vh",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column"
  }
};