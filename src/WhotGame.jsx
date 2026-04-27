import { useEffect, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// =========================
// SAFE PARSER
// =========================
function parseGame(g) {
  return {
    ...g,
    players:
      typeof g.players === "string"
        ? g.players.split(",").filter(Boolean)
        : [],

    playerNames:
      typeof g.playerNames === "string"
        ? g.playerNames.split(",")
        : [],

    deck:
      typeof g.deck === "string"
        ? g.deck.split(",").filter(Boolean)
        : [],

    hands:
      typeof g.hands === "string"
        ? g.hands.split("|").map(p =>
            p ? p.split(",").filter(Boolean) : []
          )
        : [[], []],

    discard: g.discard || "",
    pendingPick: Number(g.pendingPick || 0),
    history:
      typeof g.history === "string"
        ? g.history.split("||")
        : [],

    scores:
      typeof g.scores === "string"
        ? g.scores.split(",").map(Number)
        : [0, 0],

    round: Number(g.round || 1),
    stake: Number(g.stake || 0),
    pot: Number(g.pot || 0)
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
// DRAW CARD (RESTORED)
// =========================
function drawCard(card) {
  if (!card) return "";

  const canvas = document.createElement("canvas");
  canvas.width = 60;
  canvas.height = 90;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 60, 90);

  ctx.fillStyle = "red";
  ctx.font = "bold 14px Arial";
  ctx.fillText(card.number, 5, 15);

  ctx.fillText(card.shape[0], 25, 50);

  return canvas.toDataURL();
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

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
        console.error("LOAD ERROR", e.message);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res => {
        setGame(parseGame(res.payload));
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  // =========================
  // GUARDS (PREVENT CRASH)
  // =========================
  if (!game || !userId) {
    return <div style={styles.center}>Loading game...</div>;
  }

  if (!game.players.length) {
    return <div style={styles.center}>Waiting for players...</div>;
  }

  const myIdx = game.players.indexOf(userId);

  if (myIdx === -1) {
    return <div style={styles.center}>Not your game</div>;
  }

  const oppIdx = myIdx === 0 ? 1 : 0;

  const myName =
    game.playerNames[myIdx] || "You";

  const oppName =
    game.playerNames[oppIdx] || "Opponent";

  const hand = game.hands[myIdx] || [];
  const opponentHand = game.hands[oppIdx] || [];
  const top = decodeCard(game.discard);

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>WHOT GAME</h2>

        <p>👤 You: {myName}</p>
        <p>👤 Opponent: {oppName}</p>

        <p>💰 Stake: ₦{game.stake}</p>
        <p>🏦 Pot: ₦{game.pot}</p>

        <p>Opponent Cards: {opponentHand.length}</p>

        <div style={styles.centerRow}>
          {top && <img src={drawCard(top)} />}
          <button>Market ({game.deck.length})</button>
        </div>

        <div style={styles.hand}>
          {hand.map((c, i) => {
            const d = decodeCard(c);
            return (
              <img
                key={i}
                src={drawCard(d)}
              />
            );
          })}
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
    maxWidth: 400,
    background: "#000000aa",
    padding: 10,
    color: "#fff"
  },
  hand: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 5
  },
  centerRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh"
  }
};