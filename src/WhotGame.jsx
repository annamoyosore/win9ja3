import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account, Query } from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";

const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// 🔊 SOUND
// =========================
function beep(freq = 400, duration = 120) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "square";

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

// =========================
// 🎴 DECK
// =========================
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

// =========================
// PARSE
// =========================
function parseGame(g) {
  return {
    ...g,
    players: g.players?.split(",") || [],
    deck: g.deck?.split(",").filter(Boolean) || [],
    hands: g.hands?.split("|").map(p => p.split(",").filter(Boolean)) || [[], []],
    pendingPick: Number(g.pendingPick || 0),
    scores: g.scores?.split(",").map(Number) || [0, 0],
    history: g.history?.split("||").filter(Boolean) || [],
    round: Number(g.round || 1),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone)
  };
}

function encodeGame(g) {
  return {
    hands: g.hands.map(p => p.join(",")).join("|"),
    deck: g.deck.join(","),
    discard: g.discard,
    pendingPick: String(g.pendingPick),
    scores: g.scores.join(","),
    history: g.history.slice(-20).join("||"),
    round: String(g.round),
    status: g.status
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const payoutRef = useRef(false);
  const [overlay, setOverlay] = useState(null);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      setGame(parseGame(g));

      if (g.matchId) {
        const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
        setMatch(m);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      async (res) => {
        const parsed = parseGame(res.payload);
        setGame(parsed);

        // 💰 PAYOUT
        if (parsed.status === "finished" && !parsed.payoutDone && !payoutRef.current) {
          payoutRef.current = true;

          const total = Number(match?.pot || 0);
          const adminCut = total * 0.1;
          const winnerAmount = total - adminCut;

          const w = await databases.listDocuments(
            DATABASE_ID,
            WALLET_COLLECTION,
            [Query.equal("userId", parsed.winnerId)]
          );

          if (w.documents.length) {
            await databases.updateDocument(
              DATABASE_ID,
              WALLET_COLLECTION,
              w.documents[0].$id,
              { balance: Number(w.documents[0].balance || 0) + winnerAmount }
            );
          }

          await databases.updateDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            parsed.$id,
            { payoutDone: true }
          );
        }
      }
    );

    return () => unsub();
  }, [gameId, userId, match]);

  if (!game || !userId || game.players.length < 2) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  const hand = game.hands[myIdx];
  const oppCards = game.hands[oppIdx]?.length || 0;

  // =========================
  // 🏁 END ROUND
  // =========================
  async function endRound(g, winnerIdx) {
    g.scores[winnerIdx] += 1;

    const isMe = winnerIdx === myIdx;

    setOverlay({ text: isMe ? "🎉 ROUND WON" : "😢 ROUND LOST" });
    setTimeout(() => setOverlay(null), 1500);

    // 🎯 MATCH END (FIRST TO 2)
    if (g.scores[winnerIdx] >= 2) {
      await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
        ...encodeGame(g),
        status: "finished",
        winnerId: g.players[winnerIdx]
      });
      return;
    }

    // 🔁 NEXT ROUND
    setTimeout(async () => {
      const deck = createDeck();

      g.hands = [deck.splice(0, 6), deck.splice(0, 6)];
      g.discard = deck.pop();
      g.deck = deck;
      g.pendingPick = 0;
      g.round += 1;

      await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, encodeGame(g));
    }, 1500);
  }

  // =========================
  // 🎴 PLAY CARD
  // =========================
  async function playCard(i) {
    if (game.status === "finished") return;

    const g = parseGame(await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId));
    if (g.turn !== userId) return;

    const card = g.hands[myIdx][i];
    g.hands[myIdx].splice(i, 1);

    // 🔚 LAST CARD → END ROUND
    if (g.hands[myIdx].length === 0) {
      await endRound(g, myIdx);
      return;
    }

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      discard: card,
      turn: g.players[oppIdx]
    });
  }

  // =========================
  // 🃏 DRAW
  // =========================
  async function drawMarket() {
    if (game.status === "finished") return;

    const g = parseGame(await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId));
    if (g.turn !== userId) return;

    // MARKET EMPTY → COMPARE CARDS
    if (!g.deck.length) {
      const myCards = g.hands[myIdx].length;
      const oppCards = g.hands[oppIdx].length;

      if (myCards !== oppCards) {
        const winner = myCards < oppCards ? myIdx : oppIdx;
        await endRound(g, winner);
      }
      return;
    }

    g.hands[myIdx].push(g.deck.pop());

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      turn: g.players[oppIdx]
    });
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        {/* PLAYERS */}
        <div style={styles.row}>
          <span>{myName}</span>
          <span>VS</span>
          <span>{oppName}</span>
        </div>

        {/* OPPONENT */}
        <div style={{ textAlign: "center" }}>
          {Array.from({ length: oppCards }).map((_, i) => (
            <div key={i}
              style={{
                display: "inline-block",
                width: 40,
                height: 60,
                background: "#222",
                margin: 2,
                animation: oppCards === 1 ? "blink 0.6s infinite" : "none"
              }}
            />
          ))}
          <div>{oppName}: {oppCards} cards</div>
        </div>

        {/* SCORE */}
        <div style={styles.row}>
          <span>Round {game.round}/3</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        {/* MONEY */}
        <div style={styles.row}>
          <span>₦{match?.stake || 0}</span>
          <span>🏦 ₦{match?.pot || 0}</span>
        </div>

        {/* TURN */}
        <p>{game.turn === userId ? "🟢 YOUR TURN" : "⏳ OPPONENT"}</p>

        {/* ACTION */}
        <button style={styles.marketBtn} onClick={drawMarket}>
          🃏 ({game.deck.length})
        </button>

        {/* HAND */}
        <div style={styles.hand}>
          {hand.map((_, i) => (
            <div
              key={i}
              style={styles.card}
              onClick={() => playCard(i)}
            />
          ))}
        </div>

        <button onClick={goHome}>Exit</button>
      </div>

      {overlay && (
        <div style={styles.overlay}>
          <div style={styles.overlayText}>{overlay.text}</div>
        </div>
      )}

      <style>{`@keyframes blink {50%{opacity:0.2}}`}</style>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  bg:{minHeight:"100vh",background:"green",display:"flex",justifyContent:"center",alignItems:"center"},
  box:{width:"95%",maxWidth:450,background:"#000000cc",padding:12,color:"#fff",borderRadius:10},
  row:{display:"flex",justifyContent:"space-between"},
  hand:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginTop:10},
  card:{width:60,height:90,background:"#fff",cursor:"pointer"},
  marketBtn:{background:"gold",padding:10,borderRadius:8,border:"none"},
  overlay:{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.8)",display:"flex",justifyContent:"center",alignItems:"center"},
  overlayText:{fontSize:28,fontWeight:"bold"}
};