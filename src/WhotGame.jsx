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

// 🔊 SOUND
function beep(freq = 200, duration = 120) {
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
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration / 1000
    );

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

// 🎴 DECK
function createDeck() {
  const valid = {
    c:[1,2,3,4,5,7,8,10,11,12,13,14],
    t:[1,2,3,4,5,7,8,10,11,12,13,14],
    s:[1,2,3,5,7,10,11,13,14],
    x:[1,2,3,5,7,10,11,13,14],
    r:[1,2,3,4,5,7,8]
  };

  let deck = [];
  Object.keys(valid).forEach(shape => {
    valid[shape].forEach(n => deck.push(shape + n));
  });

  return deck.sort(() => Math.random() - 0.5);
}
// 🏁 END ROUND
async function endRound(g, winner) {
  g = JSON.parse(JSON.stringify(g));
  g.scores[winner]++;
  g.history.push(`P${winner+1} won round ${g.round}`);

  if (g.scores[winner] === 2 && !g.payoutDone) {

    g.status = "finished";
    g.winnerId = g.players[winner];

    // 🔒 LOCK payout first
    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      { payoutDone: true }
    );

    // 💰 PAY WINNER
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", g.players[winner])]
      );

      if (res.documents.length) {
        const wallet = res.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          wallet.$id,
          {
            balance: Number(wallet.balance || 0) + g.pot
          }
        );
      }
    } catch (e) {
      console.log("Payout failed:", e);
    }

    g.payoutDone = true;

    // 🧾 UPDATE GAME FINAL STATE
    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      encodeGame(g)
    );

    // 🏁 UPDATE MATCH
    try {
      const matchRes = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [Query.equal("gameId", gameId)]
      );

      if (matchRes.documents.length) {
        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          matchRes.documents[0].$id,
          {
            status: "finished",
            winnerId: g.players[winner]
          }
        );
      }
    } catch {}

    return;
  }

  // 🔁 NEXT ROUND
  const d = createDeck();
  g.hands = [d.splice(0,6), d.splice(0,6)];
  g.discard = d.pop();
  g.deck = d;
  g.round++;

  await databases.updateDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    gameId,
    encodeGame(g)
  );
}
// 🎴 PLAY CARD (FAST + SAFE)
async function playCard(i) {
  if (lock.current || game.status === "finished") return;

  if (game.turn !== userId) {
    setError("⏳ Wait your turn");
    beep(120, 80);
    setTimeout(() => setError(""), 600);
    return;
  }

  lock.current = true;

  try {
    const g = JSON.parse(JSON.stringify(game));
    const card = g.hands[myIdx][i];
    const top = g.discard;

    if (!top) return;

    // 🚫 MUST PICK FIRST
    if (g.pendingPick > 0) {
      setError("❌ You must pick cards");
      beep(120, 100);
      setTimeout(() => setError(""), 600);
      return;
    }

    // ❌ INVALID MOVE
    if (
      card[0] !== top[0] &&
      card.slice(1) !== top.slice(1) &&
      card.slice(1) !== "14"
    ) {
      setError("❌ Invalid move");
      beep(100, 120);
      setTimeout(() => setError(""), 600);
      return;
    }

    g.hands[myIdx].splice(i, 1);

    let next = g.players[oppIdx];
    const num = card.slice(1);

    let msg = `${name(myIdx)} played ${card}`;

    // 🎯 RULE ENGINE
    if (num === "1") {
      next = g.players[myIdx];
      msg += " (again)";
    }

    if (num === "2") {
      g.pendingPick += 2;
      msg += " (+2)";
    }

    if (num === "8") {
      next = g.players[myIdx];
      msg += " (skip)";
    }

    if (num === "14") {
      g.pendingPick += 1;
      msg += " (market)";
    }

    g.history.push(msg);

    // 🏁 ROUND WIN
    if (!g.hands[myIdx].length) {
      await endRound(g, myIdx);
      return;
    }

    // ⚡ INSTANT UI FEEL
    setGame({ ...g, discard: card, turn: next });

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      { ...encodeGame(g), discard: card, turn: next }
    );

  } catch (e) {
    console.log("playCard error:", e);
  }

  lock.current = false;
}

// 🃏 DRAW (FAST + MARKET SAFE)
async function draw() {
  if (lock.current || game.status === "finished") return;

  if (game.turn !== userId) {
    setError("⏳ Wait your turn");
    beep(120, 80);
    setTimeout(() => setError(""), 600);
    return;
  }

  lock.current = true;

  try {
    const g = JSON.parse(JSON.stringify(game));

    // 🧠 MARKET EMPTY LOGIC
    if (!g.deck.length) {
      const p1 = g.hands[0].length;
      const p2 = g.hands[1].length;

      if (p1 === p2) {
        g.history.push("Round draw (market finished)");

        const d = createDeck();
        g.hands = [d.splice(0, 6), d.splice(0, 6)];
        g.discard = d.pop();
        g.deck = d;
        g.round++;

        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          encodeGame(g)
        );
        return;
      }

      const win = p1 < p2 ? 0 : 1;
      g.history.push(`${name(win)} wins (market finished)`);

      await endRound(g, win);
      return;
    }

    // 📦 NORMAL DRAW / STACK PICK
    const picks = g.pendingPick > 0 ? g.pendingPick : 1;

    for (let i = 0; i < picks; i++) {
      if (g.deck.length) {
        g.hands[myIdx].push(g.deck.pop());
      }
    }

    g.pendingPick = 0;
    g.history.push(`${name(myIdx)} picked ${picks}`);

    const next = g.players[oppIdx];

    // ⚡ INSTANT UI
    setGame({ ...g, turn: next });

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      { ...encodeGame(g), turn: next }
    );

  } catch (e) {
    console.log("draw error:", e);
  }

  lock.current = false;
}