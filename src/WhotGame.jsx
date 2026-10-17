import { useEffect, useRef, useState } from "react";

import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

import Messages from "./pages/Messages";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";

const WINNING_SCORE = 2;
const EXIT_COUNTDOWN = 5;

// ======================================================
// SOUND
// ======================================================

function beep(freq = 200, duration = 200) {
  try {
    const AudioCtx =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "square";

    osc.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration / 1000
    );

    osc.start();

    setTimeout(() => {
      try {
        osc.stop();
        ctx.close();
      } catch {}
    }, duration);
  } catch {}
}

function successSound() {
  beep(600, 200);

  setTimeout(() => {
    beep(800, 200);
  }, 150);
}

// ======================================================
// CREATE DECK
// ======================================================

function createDeck() {
  const valid = {
    c: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
    t: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
    s: [1, 2, 3, 5, 7, 10, 11, 13, 14],
    x: [1, 2, 3, 5, 7, 10, 11, 13, 14],
    r: [1, 2, 3, 4, 5, 7, 8]
  };

  const deck = [];

  Object.keys(valid).forEach(shape => {
    valid[shape].forEach(number => {
      deck.push(shape + number);
    });
  });

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// ======================================================
// DECODE CARD
// ======================================================

function decodeCard(str) {
  if (!str) return null;

  const map = {
    c: "circle",
    t: "triangle",
    s: "square",
    r: "star",
    x: "cross"
  };

  const shape = map[str[0]];
  const number = Number(str.slice(1));

  if (!shape || !Number.isFinite(number)) {
    return null;
  }

  return { shape, number };
}

// ======================================================
// CARD IMAGE CACHE
// ======================================================

const cache = new Map();

// ======================================================
// DRAW CARD
// ======================================================

function drawCard(card) {
  if (!card) return null;

  const key = `${card.shape}_${card.number}`;

  if (cache.has(key)) {
    return cache.get(key);
  }

  const canvas = document.createElement("canvas");

  canvas.width = 70;
  canvas.height = 100;

  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 70, 100);

  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 66, 96);

  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 14px Arial";
  ctx.fillText(card.number, 6, 18);

  const cx = 35;
  const cy = 55;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") {
    ctx.fillRect(cx - 12, cy - 12, 24, 24);
  }

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.closePath();
    ctx.fill();
  }

  if (card.shape === "star") {
    ctx.font = "22px Arial";
    ctx.fillText("★", cx - 10, cy + 8);
  }

  if (card.shape === "cross") {
    ctx.fillRect(cx - 3, cy - 12, 6, 24);
    ctx.fillRect(cx - 12, cy - 3, 24, 6);
  }

  const img = canvas.toDataURL();

  if (cache.size < 200) {
    cache.set(key, img);
  }

  return img;
}

// ======================================================
// DRAW CARD BACK
// ======================================================

function drawBack() {
  if (cache.has("BACK_CARD")) {
    return cache.get("BACK_CARD");
  }

  const canvas = document.createElement("canvas");

  canvas.width = 65;
  canvas.height = 100;

  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 65, 100);

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 61, 96);

  ctx.fillStyle = "#fff";
  ctx.font = "20px Arial";
  ctx.fillText("🂠", 18, 60);

  const img = canvas.toDataURL();

  cache.set("BACK_CARD", img);

  return img;
}

// ======================================================
// PARSE APPWRITE GAME DOCUMENT
// ======================================================

function parseGame(g) {
  const split = (value, separator) =>
    typeof value === "string"
      ? value.split(separator).filter(Boolean)
      : [];

  const parsedScores = Array.isArray(g.scores)
    ? g.scores.map(Number)
    : split(g.scores, ",").map(Number);

  const players = Array.isArray(g.players)
    ? g.players
    : split(g.players, ",");

  const parsedHands = Array.isArray(g.hands)
    ? g.hands
    : split(g.hands, "|").map(hand =>
        split(hand, ",")
      );

  return {
    ...g,

    players,
    hands: parsedHands,

    deck: Array.isArray(g.deck)
      ? g.deck
      : split(g.deck, ","),

    discard: g.discard || null,
    turn: g.turn || null,

    pendingPick: Number(g.pendingPick || 0),

    history: Array.isArray(g.history)
      ? g.history
      : split(g.history, "||"),

    scores:
      parsedScores.length === 2 &&
      parsedScores.every(Number.isFinite)
        ? parsedScores
        : [0, 0],

    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: g.payoutDone === true,
    winnerId: g.winnerId || null,
    matchId: g.matchId || null,
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2"
  };
}

// ======================================================
// ENCODE GAME FOR APPWRITE
// ======================================================

function encodeGame(g) {
  return {
    hands: (g.hands || [])
      .map(hand => hand.join(","))
      .join("|"),

    deck: (g.deck || []).join(","),
    discard: g.discard || "",
    turn: g.turn || null,

    pendingPick: String(g.pendingPick || 0),

    history: (g.history || [])
      .slice(-10)
      .join("||"),

    scores: (g.scores || [0, 0]).join(","),
    round: String(g.round || 1),
    status: g.status || "playing",
    payoutDone: g.payoutDone === true,
    winnerId: g.winnerId || null
  };
}

// ======================================================
// ENSURE GAME IS READY
// Never replace an already initialized game.
// ======================================================

function ensureGameReady(g) {
  if (g.status === "finished") {
    return g;
  }

  const validPlayers =
    Array.isArray(g.players) &&
    g.players.length === 2;

  if (!validPlayers) {
    return {
      ...g,
      status: "waiting"
    };
  }

  if (
    g.deck?.length &&
    g.hands?.[0]?.length &&
    g.hands?.[1]?.length &&
    g.discard
  ) {
    return g;
  }

  // Only initialize when the game state is incomplete.
  const deck = createDeck();

  const hands = [
    deck.splice(0, 6),
    deck.splice(0, 6)
  ];

  const discard = deck.pop();

  return {
    ...g,
    hands,
    deck,
    discard,
    turn: g.players[0],
    pendingPick: 0,
    history: [],
    scores:
      Array.isArray(g.scores) && g.scores.length === 2
        ? g.scores
        : [0, 0],
    round: Number(g.round || 1),
    status: "playing",
    payoutDone: false,
    winnerId: null
  };
}

// ======================================================
// GAME HISTORY
// ======================================================

function pushHistory(g, message) {
  return [
    ...(g.history || []),
    message
  ].slice(-10);
}

// ======================================================
// START NEXT ROUND
// ======================================================

function startNextRound(g, message) {
  const deck = createDeck();

  const hands = [
    deck.splice(0, 6),
    deck.splice(0, 6)
  ];

  const discard = deck.pop();

  return {
    ...g,
    hands,
    deck,
    discard,
    pendingPick: 0,
    round: Number(g.round || 1) + 1,
    turn: g.players[0],
    status: "playing",
    winnerId: null,
    payoutDone: false,
    history: pushHistory(
      g,
      message ||
        `♻️ Round ${Number(g.round || 1) + 1} started`
    )
  };
}

// ======================================================
// AWARD ROUND
// First to 2 points wins the match.
// ======================================================

function awardRound(g, winnerIdx) {
  const scores = [...(g.scores || [0, 0])];

  scores[winnerIdx] =
    Number(scores[winnerIdx] || 0) + 1;

  const winnerId = g.players[winnerIdx];

  const winnerName =
    winnerIdx === 0
      ? g.hostName
      : g.opponentName;

  const updated = {
    ...g,
    scores,
    history: pushHistory(
      g,
      `🏆 ${winnerName} won round ${g.round}`
    )
  };

  if (scores[winnerIdx] >= WINNING_SCORE) {
    return {
      ...updated,
      status: "finished",
      winnerId,
      payoutDone: false,
      turn: null,
      history: pushHistory(
        updated,
        `🏆 ${winnerName} wins the match!`
      )
    };
  }

  return startNextRound(
    updated,
    `♻️ Round ${Number(g.round || 1) + 1} started`
  );
}

// ======================================================
// EMPTY MARKET
// ======================================================

function handleEmptyMarket(g) {
  const p0 = g.hands?.[0]?.length ?? 0;
  const p1 = g.hands?.[1]?.length ?? 0;

  if (p0 < p1) return awardRound(g, 0);
  if (p1 < p0) return awardRound(g, 1);

  return startNextRound(
    {
      ...g,
      history: pushHistory(
        g,
        "⚖️ Equal hand sizes. No point awarded."
      )
    },
    `♻️ Round ${Number(g.round || 1) + 1} started`
  );
}

// ======================================================
// WHOT GAME COMPONENT
// ======================================================

export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);

  const [error, setError] = useState("");
  const [showWin, setShowWin] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [countdown, setCountdown] =
    useState(EXIT_COUNTDOWN);

  const payoutRef = useRef(false);
  const actionLock = useRef(false);
  const finishedHandledRef = useRef(false);
  const winSoundRef = useRef(false);
  const exitTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  function invalidMove(message) {
    beep(120, 300);
    setError(message);

    setTimeout(() => {
      setError("");
    }, 3500);
  }

  // Load current user.
  useEffect(() => {
    let cancelled = false;

    account
      .get()
      .then(user => {
        if (!cancelled) setUserId(user.$id);
      })
      .catch(err => {
        console.error("Could not load current user:", err);

        if (!cancelled) {
          setError("Please log in to play.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ====================================================
  // WINNER PAYOUT
  // Wallet field is coins, not balance.
  // Lobby has already removed the admin commission.
  // The winner receives the entire remaining pot.
  // ====================================================

  async function handlePayout(finalGame) {
    if (payoutRef.current === "paid") return;

    if (
      !finalGame?.matchId ||
      !finalGame?.winnerId ||
      finalGame.winnerId !== userId
    ) {
      return;
    }

    // Prevent overlapping attempts in this browser only.
    if (payoutRef.current === "processing") return;

    payoutRef.current = "processing";

    try {
      const matchDoc = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        finalGame.matchId
      );

      if (matchDoc.payoutDone === true) {
        payoutRef.current = "paid";

        setMatch(previous =>
          previous
            ? { ...previous, payoutDone: true, pot: 0 }
            : previous
        );

        return;
      }

      const pot = Number(matchDoc.pot || 0);

      if (!Number.isSafeInteger(pot) || pot < 0) {
        throw new Error("The match pot is invalid.");
      }

      // Do not guess whether a zero pot was already paid.
      // A zero pot with payoutDone=false needs admin review.
      if (pot === 0) {
        throw new Error(
          "The pot is zero but payoutDone is false. " +
          "No payout was made; this match needs admin review."
        );
      }

      const walletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [
          Query.equal("userId", finalGame.winnerId),
          Query.limit(1)
        ]
      );

      if (!walletRes.documents.length) {
        throw new Error("Winner wallet was not found.");
      }

      const wallet = walletRes.documents[0];

      const currentCoins = Number(wallet.coins || 0);

      if (
        !Number.isSafeInteger(currentCoins) ||
        currentCoins < 0
      ) {
        throw new Error("Winner wallet coins are invalid.");
      }

      // Best-effort client-side payout.
      // A server-side transaction is required for exactly-once payment.
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          coins: currentCoins + pot
        }
      );

      // Mark the pot empty and payout complete.
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        matchDoc.$id,
        {
          pot: 0,
          payoutDone: true,
          status: "finished"
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          payoutDone: true,
          status: "finished",
          turn: null
        }
      );

      setMatch(previous =>
        previous
          ? {
              ...previous,
              pot: 0,
              payoutDone: true,
              status: "finished"
            }
          : previous
      );

      payoutRef.current = "paid";

      console.log(`Payout successful: ${pot} coins`);
    } catch (err) {
      console.error("WHOT payout needs review:", err);

      // Keep the failure visible and do not automatically retry.
      // Retrying a partial client-side payout can pay twice.
      payoutRef.current = "failed";

      setError(
        err?.message ||
        "Payout could not be confirmed. Contact the administrator."
      );
    }
  }

  // ====================================================
  // FINISHED GAME HANDLING
  // ====================================================

  function handleFinishedGame(finalGame) {
    if (finishedHandledRef.current) return;

    finishedHandledRef.current = true;

    if (
      finalGame.winnerId &&
      finalGame.winnerId === userId
    ) {
      setShowWin(true);

      if (!winSoundRef.current) {
        successSound();
        winSoundRef.current = true;
      }
    }

    setCountdown(EXIT_COUNTDOWN);

    let seconds = EXIT_COUNTDOWN;

    clearInterval(countdownIntervalRef.current);

    countdownIntervalRef.current = setInterval(() => {
      seconds -= 1;
      setCountdown(Math.max(seconds, 0));

      if (seconds <= 0) {
        clearInterval(countdownIntervalRef.current);
      }
    }, 1000);

    clearTimeout(exitTimerRef.current);

    exitTimerRef.current = setTimeout(async () => {
      clearInterval(countdownIntervalRef.current);

      try {
        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          {
            status: "finished",
            turn: null
          }
        );

        if (finalGame.matchId) {
          await databases.updateDocument(
            DATABASE_ID,
            MATCH_COLLECTION,
            finalGame.matchId,
            {
              status: "finished"
            }
          );
        }
      } catch (err) {
        console.error("Finished-game cleanup failed:", err);
      }

      if (typeof goHome === "function") {
        goHome();
      }
    }, EXIT_COUNTDOWN * 1000);
  }

  // ====================================================
  // LOAD GAME AND REALTIME SUBSCRIPTION
  // ====================================================

  useEffect(() => {
    if (!gameId || !userId) return;

    let cancelled = false;
    let unsubscribe = null;

    async function loadGame() {
      let document = null;

      try {
        document = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );
      } catch (err) {
        console.error("Could not load game document:", err);
      }

      // Recover only if a corresponding match exists and
      // no game document currently exists.
      if (!document) {
        try {
          const matchResult = await databases.listDocuments(
            DATABASE_ID,
            MATCH_COLLECTION,
            [
              Query.equal("gameId", gameId),
              Query.limit(1)
            ]
          );

          if (matchResult.documents.length) {
            const matchDocument = matchResult.documents[0];

            const players = [
              matchDocument.hostId,
              matchDocument.opponentId
            ].filter(Boolean);

            if (players.length !== 2) {
              throw new Error(
                "Match must contain exactly two players."
              );
            }

            // This creates a new game only when the original
            // game document is missing. It cannot restore
            // a previously lost deck or hand.
            const deck = createDeck();

            const newGame = {
              players,
              hands: [
                deck.splice(0, 6),
                deck.splice(0, 6)
              ],
              discard: deck.pop(),
              deck,
              turn: players[0],
              pendingPick: 0,
              history: [],
              scores: [0, 0],
              round: 1,
              status: "playing",
              matchId: matchDocument.$id,
              hostName: matchDocument.hostName || "Player 1",
              opponentName:
                matchDocument.opponentName || "Player 2",
              payoutDone: false,
              winnerId: null
            };

            document = await databases.createDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              gameId,
              {
                matchId: matchDocument.$id,
                players: players.join(","),
                ...encodeGame(newGame)
              }
            );

            setMatch(matchDocument);
          }
        } catch (err) {
          console.error("Game recovery failed:", err);
        }
      }

      if (!document || cancelled) {
        if (!cancelled) {
          setError(
            "Game could not be loaded. Return to the lobby or contact support."
          );
        }

        return;
      }

      const parsedDocument = parseGame(document);

      if (parsedDocument.matchId) {
        try {
          const matchDocument = await databases.getDocument(
            DATABASE_ID,
            MATCH_COLLECTION,
            parsedDocument.matchId
          );

          if (!cancelled) {
            setMatch(matchDocument);
          }
        } catch (err) {
          console.error("Could not load match:", err);
        }
      }

      if (cancelled) return;

      const readyGame = ensureGameReady(parsedDocument);

      setGame(readyGame);

      // Persist initialization if a missing game state was rebuilt.
      if (
        parsedDocument.status !== "finished" &&
        readyGame.status === "playing" &&
        (
          !parsedDocument.deck?.length ||
          !parsedDocument.hands?.[0]?.length ||
          !parsedDocument.hands?.[1]?.length ||
          !parsedDocument.discard
        )
      ) {
        try {
          await databases.updateDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            gameId,
            {
              ...encodeGame(readyGame),
              players: readyGame.players.join(","),
              matchId: readyGame.matchId || null
            }
          );
        } catch (err) {
          console.error("Could not save initialized game:", err);
        }
      }

      if (readyGame.status === "finished") {
        if (
          readyGame.winnerId === userId &&
          !readyGame.payoutDone
        ) {
          await handlePayout(readyGame);
        }

        handleFinishedGame(readyGame);
      }
    }

    loadGame();

    try {
      unsubscribe = databases.client.subscribe(
        `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
        async event => {
          if (cancelled) return;

          const parsed = parseGame(event.payload);

          setGame(parsed);

          if (parsed.status === "finished") {
            if (
              parsed.winnerId === userId &&
              !parsed.payoutDone
            ) {
              await handlePayout(parsed);
            }

            handleFinishedGame(parsed);
          }
        }
      );
    } catch (err) {
      console.error("Could not subscribe to game updates:", err);
    }

    return () => {
      cancelled = true;

      if (typeof unsubscribe === "function") {
        unsubscribe();
      }

      clearTimeout(exitTimerRef.current);
      clearInterval(countdownIntervalRef.current);
    };
  }, [gameId, userId]);

  // ====================================================
  // PLAY CARD
  // ====================================================

  async function playCard(index) {
    if (!game || !userId) return;
    if (actionLock.current) return;
    if (game.status === "finished") return;

    const myIdx = game.players.indexOf(userId);

    if (myIdx < 0) {
      return invalidMove("You are not a player in this match.");
    }

    if (game.turn !== userId) {
      return invalidMove("Not your turn.");
    }

    actionLock.current = true;

    try {
      const g = JSON.parse(JSON.stringify(game));
      const oppIdx = myIdx === 0 ? 1 : 0;

      const card = g.hands?.[myIdx]?.[index];

      if (!card) return;

      const current = decodeCard(card);
      const topDecoded = decodeCard(g.discard);

      if (!current || !topDecoded) {
        return invalidMove("This card cannot be played.");
      }

      if (
        g.pendingPick > 0 &&
        ![2, 14].includes(current.number)
      ) {
        return invalidMove("Use 2 or 14 to stack the pick.");
      }

      if (
        current.number !== topDecoded.number &&
        current.shape !== topDecoded.shape &&
        current.number !== 14
      ) {
        return invalidMove("Wrong move. Match the number, shape, or play WHOT 14.");
      }

      g.hands[myIdx].splice(index, 1);
      g.discard = card;

      let nextTurn = g.players[oppIdx];

      if (current.number === 1 || current.number === 8) {
        nextTurn = userId;
      }

      if (current.number === 2) {
        g.pendingPick += 2;
      }

      if (current.number === 14) {
        g.pendingPick += 1;
      }

      const myLabel = myIdx === 0 ? "Player 1" : "Player 2";

      g.history = pushHistory(g, `${myLabel} played ${card}`);

      if (g.hands[myIdx].length === 0) {
        const result = awardRound(g, myIdx);

        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          {
            ...encodeGame(result),
            status: result.status,
            winnerId: result.winnerId || null,
            payoutDone: result.payoutDone === true,
            turn: result.turn || null
          }
        );

        setGame(result);
        return;
      }

      g.turn = nextTurn;

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

      setGame(g);
    } catch (err) {
      console.error("playCard error:", err);

      invalidMove("Could not save your move. Refresh and try again.");
    } finally {
      actionLock.current = false;
    }
  }

  // ====================================================
  // DRAW FROM MARKET
  // ====================================================

  async function drawMarket() {
    if (!game || !userId) return;
    if (actionLock.current) return;
    if (game.status === "finished") return;

    const myIdx = game.players.indexOf(userId);

    if (myIdx < 0) {
      return invalidMove("You are not a player in this match.");
    }

    if (game.turn !== userId) {
      return invalidMove("Not your turn.");
    }

    actionLock.current = true;

    try {
      const g = JSON.parse(JSON.stringify(game));
      const oppIdx = myIdx === 0 ? 1 : 0;

      const drawCount =
        g.pendingPick > 0 ? g.pendingPick : 1;

      if (!g.deck.length) {
        const result = handleEmptyMarket(g);

        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          {
            ...encodeGame(result),
            status: result.status,
            winnerId: result.winnerId || null,
            payoutDone: result.payoutDone === true,
            turn: result.turn || null
          }
        );

        setGame(result);
        return;
      }

      let actualDrawCount = 0;

      for (let i = 0; i < drawCount; i++) {
        if (!g.deck.length) break;

        const picked = g.deck.pop();

        if (picked) {
          g.hands[myIdx].push(picked);
          actualDrawCount += 1;
        }
      }

      g.pendingPick = 0;
      g.turn = g.players[oppIdx];

      const myLabel = myIdx === 0 ? "Player 1" : "Player 2";

      g.history = pushHistory(
        g,
        `${myLabel} drew ${actualDrawCount} card${
          actualDrawCount === 1 ? "" : "s"
        }`
      );

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        encodeGame(g)
      );

      setGame(g);
    } catch (err) {
      console.error("drawMarket error:", err);

      invalidMove("Could not draw cards. Please try again.");
    } finally {
      actionLock.current = false;
    }
  }

    // ====================================================
  // DERIVED STATE
  // ====================================================

  if (!game || !userId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#064e3b",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          textAlign: "center"
        }}
      >
        {error || "Loading WHOT game..."}
      </div>
    );
  }

  const myIdx = game.players.indexOf(userId);

  if (myIdx < 0) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#064e3b",
          color: "#fff",
          padding: 20,
          textAlign: "center"
        }}
      >
        You are not a player in this match.

        <button
          onClick={goHome}
          style={{ display: "block", margin: "20px auto" }}
        >
          Return Home
        </button>
      </div>
    );
  }

  const oppIdx = myIdx === 0 ? 1 : 0;
  const hand = game.hands?.[myIdx] || [];
  const oppCards = game.hands?.[oppIdx]?.length || 0;
  const top = decodeCard(game.discard);

  const myLabel = myIdx === 0 ? "Player 1" : "Player 2";
  const oppLabel = myIdx === 0 ? "Player 2" : "Player 1";

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        {error && (
          <div style={styles.error} role="alert">
            {error}
          </div>
        )}

        <h3
          style={{
            textAlign: "center",
            marginBottom: 8
          }}
        >
          🎮 Win9ja Life — WHOT
        </h3>

        <div style={styles.row}>
          <span>Player 1 ({game.hostName})</span>
          <span>VS</span>
          <span>Player 2 ({game.opponentName})</span>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={styles.opponentHand}>
            {Array.from({ length: oppCards }).map((_, index) => (
              <img
                key={index}
                src={drawBack()}
                alt="Opponent card"
                style={{
                  width: 30,
                  height: 48,
                  borderRadius: 5
                }}
              />
            ))}
          </div>

          <div>
            {oppLabel} Cards: {oppCards}
          </div>
        </div>

        <div style={styles.row}>
          <span>Round {game.round}</span>

          <span style={styles.score}>
            {game.scores[0]} - {game.scores[1]}
          </span>

          <span>First to {WINNING_SCORE}</span>
        </div>

        <div style={styles.coinPanel}>
          <span>
            🪙 Stake:{" "}
            {Number(match?.stake || 0).toLocaleString()} Coins
          </span>

          <span>
            🏦 Pot:{" "}
            {Number(match?.pot || 0).toLocaleString()} Coins
          </span>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 8
          }}
        >
          <p>
            {game.status === "finished"
              ? game.winnerId === userId
                ? "🏆 YOU WON THE MATCH!"
                : "🏁 MATCH FINISHED"
              : game.turn === userId
              ? "🟢 YOUR TURN"
              : "⏳ OPPONENT'S TURN"}
          </p>

          {game.status === "finished" && (
            <div style={styles.countdown}>
              Returning home in {countdown}s...
            </div>
          )}

          <button
            type="button"
            style={styles.chatBtn}
            onClick={() => setShowChat(true)}
          >
            💬 Message
          </button>
        </div>

        <div style={styles.center}>
          {top && (
            <img
              src={drawCard(top)}
              alt="Top discard card"
              style={styles.card}
            />
          )}

          <button
            type="button"
            style={{
              ...styles.marketBtn,
              opacity:
                game.status === "finished" ||
                game.turn !== userId
                  ? 0.6
                  : 1
            }}
            disabled={
              game.status === "finished" ||
              game.turn !== userId
            }
            onClick={drawMarket}
          >
            🃏 Draw ({game.deck.length})
          </button>
        </div>

        {game.pendingPick > 0 &&
          game.status !== "finished" && (
            <div style={styles.pendingPick}>
              ⚠️ Pick stack: {game.pendingPick} card(s).
              {" "}Play a 2 or 14 to stack.
            </div>
          )}

        <div style={styles.hand}>
          {hand.map((card, index) => (
            <button
              key={`${card}-${index}`}
              type="button"
              onClick={() => playCard(index)}
              disabled={
                game.status === "finished" ||
                game.turn !== userId
              }
              style={styles.handCardButton}
              aria-label={`Play card ${card}`}
            >
              <img
                src={drawCard(decodeCard(card))}
                alt={`Card ${card}`}
                style={{
                  ...styles.card,
                  opacity:
                    game.status === "finished" ||
                    game.turn !== userId
                      ? 0.75
                      : 1
                }}
              />
            </button>
          ))}
        </div>

        {showWin &&
          game.status === "finished" &&
          game.winnerId === userId && (
            <div style={styles.winBox}>
              🎉 YOU WON!

              <div style={styles.winAmount}>
                🪙{" "}
                {Number(match?.pot || 0).toLocaleString()} Coins
              </div>

              <div style={styles.winNote}>
                Your match reward is being processed.
                If the payout fails, contact the administrator.
              </div>
            </div>
          )}

        <div style={styles.history}>
          <strong>📜 Game History</strong>

          {(game.history || [])
            .slice()
            .reverse()
            .map((message, index) => (
              <div
                key={`${index}-${message}`}
                style={{ marginTop: 5 }}
              >
                {message}
              </div>
            ))}
        </div>

        <button
          type="button"
          style={styles.exitBtn}
          onClick={goHome}
        >
          Exit Game
        </button>

        {showChat && game.matchId && (
          <div style={styles.chatOverlay}>
            <div style={styles.chatBox}>
              <div style={styles.chatHeader}>
                <span>💬 Match Chat</span>

                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  style={styles.chatClose}
                  aria-label="Close chat"
                >
                  ✕
                </button>
              </div>

              <Messages matchId={game.matchId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = {
  bg: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #065f46, #064e3b)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 10
  },

  box: {
    position: "relative",
    width: "95%",
    maxWidth: 450,
    background: "#000000cc",
    padding: 12,
    color: "#fff",
    borderRadius: 14,
    backdropFilter: "blur(6px)",
    boxShadow: "0 0 20px rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.08)"
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    fontSize: 12,
    gap: 8
  },

  score: {
    fontSize: 18,
    fontWeight: "bold",
    color: "gold"
  },

  coinPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
    borderRadius: 9,
    background: "#172019",
    border: "1px solid #36553c",
    fontSize: 13,
    fontWeight: "bold"
  },

  opponentHand: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 3,
    marginBottom: 5,
    minHeight: 48
  },

  hand: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 12
  },

  handCardButton: {
    padding: 0,
    margin: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: 8
  },

  card: {
    width: 65,
    height: 100,
    objectFit: "contain",
    cursor: "pointer",
    borderRadius: 8,
    transition: "transform 0.15s ease",
    userSelect: "none"
  },

  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 12
  },

  marketBtn: {
    background: "gold",
    color: "#000",
    padding: 10,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: "bold",
    minWidth: 100,
    boxShadow: "0 0 10px rgba(255,215,0,0.4)"
  },

  pendingPick: {
    textAlign: "center",
    background: "#713f12",
    color: "#fde68a",
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
    fontSize: 12
  },

  winBox: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "gold",
    color: "#000",
    padding: 22,
    borderRadius: 12,
    zIndex: 9999,
    fontWeight: "bold",
    fontSize: 20,
    textAlign: "center",
    boxShadow: "0 0 20px rgba(255,215,0,0.7)",
    width: "min(85%, 320px)"
  },

  winAmount: {
    marginTop: 12,
    fontSize: 18
  },

  winNote: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "normal"
  },

  countdown: {
    color: "gold",
    fontWeight: "bold",
    marginBottom: 8
  },

  error: {
    background: "#dc2626",
    padding: 8,
    textAlign: "center",
    marginBottom: 8,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "bold"
  },

  history: {
    marginTop: 12,
    maxHeight: 130,
    overflowY: "auto",
    fontSize: 12,
    color: "#ffb4b4",
    background: "#111",
    padding: 8,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.05)"
  },

  chatBtn: {
    background: "#2563eb",
    color: "#fff",
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 4
  },

  exitBtn: {
    marginTop: 10,
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "none",
    background: "#374151",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold"
  },

  chatOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99999,
    padding: 10
  },

  chatBox: {
    width: "95%",
    maxWidth: 400,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#111",
    padding: 10,
    borderRadius: 12,
    boxShadow: "0 0 15px rgba(0,0,0,0.6)"
  },

  chatHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "bold"
  },

  chatClose: {
    border: "none",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    fontSize: 18
  }
};
