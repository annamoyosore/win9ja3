import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query,
  ID
} from "./lib/appwrite";

import Messages from "./Messages";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";

// 🔊 SOUND
function beep(freq = 200, duration = 200) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "square";

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

function winSound() {
  beep(600, 200);
  setTimeout(() => beep(900, 200), 150);
}

// 🎴 DECK
function createDeck() {
  const valid = {
    c: [1,2,3,4,5,7,8,10,11,12,13,14],
    t: [1,2,3,4,5,7,8,10,11,12,13,14],
    s: [1,2,3,5,7,10,11,13,14],
    x: [1,2,3,5,7,10,11,13,14],
    r: [1,2,3,4,5,7,8]
  };

  let deck = [];
  Object.keys(valid).forEach(shape => {
    valid[shape].forEach(n => deck.push(shape + n));
  });

  return deck.sort(() => Math.random() - 0.5);
}
function pushHistory(g, text) {
  return [...(g.history || []), text].slice(-10);
}

function parseGame(g) {
  const split = (v, s) => typeof v === "string" ? v.split(s).filter(Boolean) : [];

  return {
    ...g,
    players: Array.isArray(g.players) ? g.players : split(g.players, ","),
    hands: split(g.hands, "|").map(p => split(p, ",")),
    deck: split(g.deck, ","),
    discard: g.discard || null,
    turn: g.turn || null,
    pendingPick: Number(g.pendingPick || 0),
    history: split(g.history, "||"),
    scores: split(g.scores, ",").map(Number) || [0,0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
    winnerId: g.winnerId || null,
    matchId: g.matchId || null,
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2"
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard || "",
    turn: g.turn,
    pendingPick: String(g.pendingPick),
    history: (g.history || []).slice(-10).join("||"),
    scores: g.scores.join(","),
    round: String(g.round),
    status: g.status
  };
}

function ensureGameReady(g) {
  if (!g.deck?.length || !g.hands?.[0]?.length || !g.hands?.[1]?.length || !g.discard) {
    const deck = createDeck();
    return {
      ...g,
      hands: [deck.splice(0,6), deck.splice(0,6)],
      discard: deck.pop(),
      deck,
      pendingPick: 0,
      history: [],
      scores: [0,0],
      round: 1,
      status: "playing"
    };
  }
  return g;
}
export default function WhotGame({ matchId, goHome }) {

  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showWin, setShowWin] = useState(false);

  const payoutRef = useRef(false);
  const actionLock = useRef(false);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  useEffect(() => {
    if (!matchId || !userId) return;

    const load = async () => {
      const m = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        matchId
      );

      setMatch(m);

      let g;
      let gid = m.gameId;

      if (!gid) {
        const newId = ID.unique();

        g = await databases.createDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          newId,
          {
            players: m.players,
            hands: "",
            deck: "",
            discard: "",
            turn: m.players[0],
            pendingPick: "0",
            history: "",
            scores: "0,0",
            round: "1",
            status: "playing",
            payoutDone: false,
            winnerId: "",
            matchId: m.$id
          }
        );

        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          m.$id,
          { gameId: newId }
        );

      } else {
        try {
          g = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            gid
          );
        } catch {
          g = await databases.createDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            gid,
            {
              players: m.players,
              hands: "",
              deck: "",
              discard: "",
              turn: m.players[0],
              pendingPick: "0",
              history: "",
              scores: "0,0",
              round: "1",
              status: "playing",
              payoutDone: false,
              winnerId: "",
              matchId: m.$id
            }
          );
        }
      }

      setGame(ensureGameReady(parseGame(g)));
    };

    load();
  }, [matchId, userId]);
if (!game || !userId) return <div>Loading...</div>;

const myIdx = game.players.indexOf(userId);
const oppIdx = myIdx === 0 ? 1 : 0;

const hand = game.hands[myIdx] || [];
const playerLabel = myIdx === 0 ? "Player 1" : "Player 2";

// 🎮 PLAY CARD
async function playCard(i) {
  if (actionLock.current) return;
  if (game.turn !== userId) return;

  actionLock.current = true;

  const g = JSON.parse(JSON.stringify(game));
  const card = g.hands[myIdx][i];

  g.hands[myIdx].splice(i, 1);

  g.history = pushHistory(g, `${playerLabel} played ${card}`);

  await databases.updateDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    game.$id,
    {
      ...encodeGame(g),
      discard: card,
      turn: g.players[oppIdx]
    }
  );

  actionLock.current = false;
}

// 🃏 DRAW
async function drawMarket() {
  if (actionLock.current) return;

  const g = JSON.parse(JSON.stringify(game));

  if (g.deck.length) {
    g.hands[myIdx].push(g.deck.pop());
  }

  g.history = pushHistory(g, `${playerLabel} picked`);

  await databases.updateDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    game.$id,
    {
      ...encodeGame(g),
      turn: g.players[oppIdx]
    }
  );
}

// 🎨 UI
return (
  <div style={styles.bg}>
    <div style={styles.box}>

      <h2 style={styles.title}>🎴 WhotGame</h2>

      <p>
        {game.turn === userId ? "🟢 YOUR TURN" : "⏳ OPPONENT"}
      </p>

      <button style={styles.msgBtn} onClick={() => setShowChat(true)}>
        💬 Message
      </button>

      <div style={styles.center}>
        <button onClick={drawMarket}>🃏 {game.deck.length}</button>
      </div>

      <div style={styles.hand}>
        {hand.map((c, i) => (
          <button key={i} onClick={() => playCard(i)}>
            {c}
          </button>
        ))}
      </div>

      <div style={styles.history}>
        {game.history.slice().reverse().map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>

      {showChat && (
        <div style={styles.chatOverlay}>
          <div style={styles.chatBox}>
            <button onClick={() => setShowChat(false)}>Close</button>
            <Messages matchId={game.matchId} userId={userId} />
          </div>
        </div>
      )}

      <button onClick={goHome}>Exit</button>
    </div>
  </div>
);
}

const styles = {
  bg: { minHeight: "100vh", background: "green", display: "flex", justifyContent: "center", alignItems: "center" },
  box: { width: "95%", maxWidth: 450, background: "#000", padding: 12, color: "#fff", borderRadius: 10 },
  title: { textAlign: "center" },
  hand: { display: "flex", flexWrap: "wrap", gap: 5 },
  center: { textAlign: "center", margin: 10 },
  msgBtn: { background: "#2563eb", color: "#fff", padding: 6 },

  history: { maxHeight: 120, overflow: "auto", fontSize: 12 },

  chatOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },

  chatBox: {
    width: "90%",
    height: "70%",
    background: "#111",
    padding: 10
  }
};