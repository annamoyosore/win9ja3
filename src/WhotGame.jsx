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

const ADMIN_PERCENT = 0.1;

// =========================
// SOUND
// =========================
function beep(freq = 400, duration = 120) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
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
// HELPERS
// =========================
function addHistory(g, msg) {
  return {
    ...g,
    history: [...(g.history || []), msg].slice(-20)
  };
}

// =========================
// DECK / DRAW / PARSE (UNCHANGED FROM YOUR FILE)
// =========================
/* KEEP YOUR:
   createDeck
   decodeCard
   drawCard
   drawBack
   parseGame
   encodeGame
*/

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showWin, setShowWin] = useState(false);
  const payoutRef = useRef(false);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
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

        if (parsed.status === "finished") {
          if (parsed.winnerId === userId) {
            setShowWin(true);
            setTimeout(goHome, 3000);
          } else {
            setTimeout(goHome, 2500);
          }

          if (parsed.payoutDone || payoutRef.current) return;
          payoutRef.current = true;

          try {
            const freshMatch = parsed.matchId
              ? await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, parsed.matchId)
              : null;

            const total = Number(freshMatch?.pot || 0);
            const adminCut = total * ADMIN_PERCENT;
            const winnerAmount = total - adminCut;

            // PAY WINNER
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
                {
                  balance: Number(w.documents[0].balance || 0) + winnerAmount
                }
              );
            }

            // UNLOCK FUNDS
            for (let pid of parsed.players) {
              const wallet = await databases.listDocuments(
                DATABASE_ID,
                WALLET_COLLECTION,
                [Query.equal("userId", pid)]
              );

              if (wallet.documents.length) {
                await databases.updateDocument(
                  DATABASE_ID,
                  WALLET_COLLECTION,
                  wallet.documents[0].$id,
                  { locked: 0 }
                );
              }
            }

            await databases.updateDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              parsed.$id,
              { payoutDone: true }
            );

            if (parsed.matchId) {
              await databases.updateDocument(
                DATABASE_ID,
                MATCH_COLLECTION,
                parsed.matchId,
                { status: "completed" }
              );
            }

          } catch (e) {
            console.log("payout error", e);
          }
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  if (!game || !userId) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands[myIdx];
  const oppCards = game.hands[oppIdx].length;
  const top = decodeCard(game.discard);

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  // =========================
  // END ROUND WITH DRAW FIX
  // =========================
  async function endRound(g, winnerIdx = null) {
    let updated = { ...g };

    if (winnerIdx !== null) {
      updated.scores[winnerIdx]++;
    }

    // DRAW HANDLING
    if (updated.round === 3 && updated.scores[0] === updated.scores[1]) {
      updated.round = 4; // sudden death
    }

    // WIN CONDITION
    if (updated.scores[winnerIdx] >= 2) {
      await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
        ...encodeGame(updated),
        status: "finished",
        winnerId: updated.players[winnerIdx]
      });
      return;
    }

    // NEW ROUND
    const deck = createDeck();
    updated.hands = [deck.splice(0, 6), deck.splice(0, 6)];
    updated.discard = deck.pop();
    updated.deck = deck;
    updated.pendingPick = 0;
    updated.round++;

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, encodeGame(updated));
  }

  // =========================
  // PLAY CARD
  // =========================
  async function playCard(i) {
    if (game.turn !== userId) {
      beep(150);
      return;
    }

    let g = { ...game };

    const card = g.hands[myIdx][i];
    const current = decodeCard(card);
    const topDecoded = decodeCard(g.discard);

    if (g.pendingPick > 0 && current.number !== 2) {
      beep(200);
      g = addHistory(g, "🔴 MUST PLAY 2 OR DRAW");
      setGame(g);
      return;
    }

    if (
      current.number !== topDecoded.number &&
      current.shape !== topDecoded.shape &&
      current.number !== 14
    ) {
      beep(120);
      g = addHistory(g, "🔴 INVALID MOVE");
      setGame(g);
      return;
    }

    g.hands[myIdx].splice(i, 1);
    g = addHistory(g, `🎴 ${card}`);

    let nextTurn = g.players[oppIdx];

    if (current.number === 2) {
      g.pendingPick += 2;
      g = addHistory(g, `🔥 PICK ${g.pendingPick}`);
    }

    if ([1, 8, 14].includes(current.number)) {
      nextTurn = userId;
    }

    if (g.hands[myIdx].length === 1) {
      beep(800);
      g = addHistory(g, "⚠ LAST CARD");
    }

    if (g.hands[myIdx].length === 0) {
      await endRound(g, myIdx);
      return;
    }

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      discard: card,
      turn: nextTurn
    });
  }

  // =========================
  // DRAW
  // =========================
  async function drawMarket() {
    if (game.turn !== userId) return;

    let g = { ...game };

    let count = g.pendingPick > 0 ? g.pendingPick : 1;

    for (let i = 0; i < count; i++) {
      if (!g.deck.length) break;
      g.hands[myIdx].push(g.deck.pop());
    }

    g.pendingPick = 0;
    g = addHistory(g, `📦 DRAW ${count}`);

    await databases.updateDocument(DATABASE_ID, GAME_COLLECTION, gameId, {
      ...encodeGame(g),
      turn: g.players[oppIdx]
    });
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        <div style={styles.row}>
          <span>{myName}</span>
          <span>VS</span>
          <span>{oppName}</span>
        </div>

        <div style={{ textAlign: "center" }}>
          {Array.from({ length: oppCards }).map((_, i) => (
            <img key={i} src={drawBack()} style={{ width: 40 }} />
          ))}
          <div>{oppName}: {oppCards}</div>
        </div>

        <div style={styles.row}>
          <span>Round {game.round}</span>
          <span>{game.scores[0]} - {game.scores[1]}</span>
        </div>

        <div style={styles.row}>
          <span>₦{match?.stake || 0}</span>
          <span>🏦 ₦{match?.pot || 0}</span>
        </div>

        {game.pendingPick > 0 && (
          <p style={{ color: "orange" }}>⚠ PICK {game.pendingPick}</p>
        )}

        <p>{game.turn === userId ? "🟢 YOUR TURN" : "⏳ OPPONENT"}</p>

        <div style={styles.center}>
          {top && <img src={drawCard(top)} style={styles.card} />}
          <button style={styles.marketBtn} onClick={drawMarket}>
            🃏 {game.deck.length}
          </button>
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => (
            <img
              key={i}
              src={drawCard(decodeCard(c))}
              style={styles.card}
              onClick={() => playCard(i)}
            />
          ))}
        </div>

        {showWin && (
          <div style={styles.win}>
            🎉 You Won ₦{match?.pot || 0}
          </div>
        )}

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
  bg: { minHeight: "100vh", background: "green", display: "flex", justifyContent: "center", alignItems: "center" },
  box: { width: "95%", maxWidth: 450, background: "#000000cc", padding: 12, color: "#fff", borderRadius: 10 },
  row: { display: "flex", justifyContent: "space-between" },
  hand: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 10 },
  card: { width: 65, cursor: "pointer" },
  center: { display: "flex", justifyContent: "center", gap: 10 },
  marketBtn: { background: "gold", padding: 10, borderRadius: 8, border: "none" },
  history: { marginTop: 10, maxHeight: 120, overflow: "auto", fontSize: 12, color: "#ff4d4d" },
  win: { position: "fixed", top: "40%", left: "50%", transform: "translate(-50%, -50%)", background: "gold", color: "#000", padding: 20, borderRadius: 10, fontWeight: "bold" }
};