import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";
const WALLET_COLLECTION = "wallets";

// 🔥 SET YOUR REAL ADMIN USER ID HERE
const ADMIN_ID = "PUT_YOUR_ADMIN_USER_ID_HERE";

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
// SAFE PARSER
// =========================
function parseGame(g) {
  return {
    ...g,

    players:
      typeof g.players === "string"
        ? JSON.parse(g.players || "[]")
        : [],

    deck:
      typeof g.deck === "string"
        ? g.deck.split(",").filter(Boolean)
        : [],

    hands:
      typeof g.hands === "string"
        ? g.hands.split("|").map(p => p.split(",").filter(Boolean))
        : [[], []],

    discard: g.discard || "",

    pendingPick: Number(g.pendingPick || 0),

    history:
      typeof g.history === "string"
        ? g.history.split("||").filter(Boolean)
        : [],

    pot: Number(g.pot || 0),

    payoutDone: Boolean(g.payoutDone)
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
    history: g.history.slice(-10).join("||")
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const payoutRef = useRef(false);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD + REALTIME
  // =========================
  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );
        setGame(parseGame(g));
      } catch (e) {
        console.error(e);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const parsed = parseGame(res.payload);
        setGame(parsed);

        // 🔥 AUTO PAYOUT TRIGGER
        if (
          parsed.status === "finished" &&
          !parsed.payoutDone &&
          !payoutRef.current
        ) {
          payoutRef.current = true;
          handlePayout(parsed);
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx] || [];
  const top = decodeCard(game.discard);

  // =========================
  // 💰 AUTO PAYOUT
  // =========================
  async function handlePayout(g) {
    try {
      const winnerId = g.winnerId;
      if (!winnerId) return;

      const adminFee = Math.floor(g.pot * 0.1);
      const winnerAmount = g.pot - adminFee;

      // 🔍 GET ALL WALLETS
      const walletsRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        []
      );

      const winnerWallet = walletsRes.documents.find(
        w => w.userId === winnerId
      );

      const adminWallet = walletsRes.documents.find(
        w => w.userId === ADMIN_ID
      );

      if (!winnerWallet || !adminWallet) {
        console.error("Wallet not found");
        return;
      }

      // 💰 PAY WINNER
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        winnerWallet.$id,
        {
          balance: (winnerWallet.balance || 0) + winnerAmount
        }
      );

      // 💰 PAY ADMIN
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        adminWallet.$id,
        {
          balance: (adminWallet.balance || 0) + adminFee
        }
      );

      // ✅ MARK PAID
      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          payoutDone: true
        }
      );

      console.log("✅ Payout complete");

    } catch (err) {
      console.error("Payout error:", err.message);
    }
  }

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (processing) return;
    setProcessing(true);

    const g = parseGame(
      await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
    );

    if (g.turn !== userId) {
      setProcessing(false);
      return;
    }

    const card = g.hands[myIdx][i];
    if (!card) {
      setProcessing(false);
      return;
    }

    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) {
      setProcessing(false);
      return;
    }

    g.hands[myIdx].splice(i, 1);

    let nextTurn = g.players[oppIdx];

    // RULES
    if (current.number === 2) g.pendingPick += 2;
    else if (current.number === 8) nextTurn = userId;
    else if (current.number === 1) nextTurn = userId;
    else if (current.number === 14) g.pendingPick += 1;

    g.history.push(`${current.shape} ${current.number}`);

    // WIN
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
      setProcessing(false);
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
  // DRAW CARD
  // =========================
  async function drawCard() {
    const g = parseGame(
      await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
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

      <button onClick={goHome}>Exit</button>
    </div>
  );
}