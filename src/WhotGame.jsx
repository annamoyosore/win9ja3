import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";

const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// 🔊 SOUND
// =========================
function beep(freq = 400, duration = 120) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = freq;
  osc.type = "square";

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + duration / 1000
  );

  setTimeout(() => {
    osc.stop();
    ctx.close();
  }, duration);
}

// =========================
// 🎴 DECK
// =========================
function createDeck() {
  const shapes = ["c", "t", "s", "r", "x"];
  let deck = [];

  for (let s of shapes) {
    for (let i = 1; i <= 13; i++) {
      deck.push(s + i);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// CARD DECODE
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
// PARSE GAME
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players?.split(",") || [],
    deck: g.deck?.split(",").filter(Boolean) || [],
    hands:
      g.hands?.split("|").map(p =>
        p.split(",").filter(Boolean)
      ) || [[], []],
    pendingPick: Number(g.pendingPick || 0),
    history: g.history?.split("||").filter(Boolean) || [],
    scores: g.scores?.split(",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    pot: Number(g.pot || 0),
    stake: Number(g.stake || 0),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    payoutDone: Boolean(g.payoutDone)
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
    pendingPick: String(g.pendingPick),
    history: g.history.slice(-12).join("||"),
    scores: g.scores.join(","),
    round: String(g.round)
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [invalidMove, setInvalidMove] = useState("");

  const payoutRef = useRef(false);

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

  // =========================
  // 💰 PAYOUT (WITH ADMIN CUT)
  // =========================
  useEffect(() => {
    if (!game || !game.winnerId || game.payoutDone) return;

    handlePayout(game);
  }, [game]);

  async function handlePayout(g) {
    if (payoutRef.current) return;
    payoutRef.current = true;

    try {
      const total = Number(g.pot || 0);

      const adminCut = total * 0.1;
      const winnerAmount = total - adminCut;

      // 💰 WINNER
      const wallets = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", g.winnerId)]
      );

      if (wallets.documents.length) {
        const w = wallets.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          w.$id,
          {
            balance: Number(w.balance || 0) + winnerAmount
          }
        );
      }

      // 👑 ADMIN CUT
      const adminWallet = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID)]
      );

      if (adminWallet.documents.length) {
        const w = adminWallet.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          w.$id,
          {
            balance: Number(w.balance || 0) + adminCut
          }
        );
      }

      // 🏁 CLOSE MATCH
      if (g.matchId) {
        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          g.matchId,
          {
            status: "finished",
            winnerId: g.winnerId
          }
        );
      }

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        g.$id,
        { payoutDone: true }
      );

    } catch (err) {
      console.error(err.message);
    }
  }

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const top = decodeCard(game.discard);

  const myName =
    myIdx === 0 ? game.hostName : game.opponentName;

  const oppName =
    myIdx === 0 ? game.opponentName : game.hostName;

  // =========================
  // PLAY CARD (RULES ONLY FIXED)
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);
    setInvalidMove("");

    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId) {
      setInvalidMove("Not your turn");
      return setProcessing(false);
    }

    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) {
      setInvalidMove("Invalid move");
      beep(200, 150);
      return setProcessing(false);
    }

    g.hands[myIdx].splice(i, 1);

    let nextTurn = g.players[oppIdx];

    // 🔥 RULES ONLY
    if (current.number === 2) g.pendingPick += 2;
    else if (current.number === 8) nextTurn = userId;
    else if (current.number === 1) nextTurn = userId;
    else if (current.number === 14) {
      g.pendingPick += 1;
      nextTurn = userId;
    }

    // ROUND WIN
    if (g.hands[myIdx].length === 0) {
      g.scores[myIdx] += 1;

      if (g.scores[myIdx] >= 2) {
        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          {
            ...encodeGame(g),
            status: "finished",
            winnerId: userId
          }
        );
        return;
      }

      // NEXT ROUND
      let deck = createDeck();
      g.hands = [deck.splice(0, 6), deck.splice(0, 6)];
      g.discard = deck.pop();
      g.deck = deck;
      g.pendingPick = 0;
      g.round += 1;

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          ...encodeGame(g),
          turn: g.players[1]
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

    setProcessing(false);
  }

  // =========================
  // DRAW
  // =========================
  async function drawMarket() {
    const g = parseGame(
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      )
    );

    if (g.turn !== userId) return;

    let count = g.pendingPick || 1;

    for (let i = 0; i < count; i++) {
      if (!g.deck.length) break;
      g.hands[myIdx].push(g.deck.pop());
    }

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
  }

  // =========================
  // UI (UNCHANGED STYLE)
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        <p>{myName} vs {oppName}</p>
        <p>💰 Stake: ₦{game.stake}</p>
        <p>🏦 Pot: ₦{game.pot}</p>

        <p>Round: {game.round}</p>
        <p>Score: {game.scores[0]} - {game.scores[1]}</p>

        {invalidMove && (
          <p style={{ color: "red" }}>{invalidMove}</p>
        )}

        <p>
          Turn: {game.turn === userId ? "🟢 YOU" : "⏳ OPPONENT"}
        </p>

        <p>Top: {top?.shape} {top?.number}</p>

        <button onClick={drawMarket}>
          MARKET ({game.deck.length})
        </button>

        <div style={styles.hand}>
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
    </div>
  );
}

// =========================
// STYLES (UNCHANGED)
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
    maxWidth: 450,
    background: "#000000cc",
    padding: 12,
    color: "#fff",
    borderRadius: 10
  },
  hand: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 10
  }
};