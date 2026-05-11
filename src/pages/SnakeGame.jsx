import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID
} from "../lib/appwrite";

import boardImg from "./board.png";

const COLLECTION = "snakegame";
const SIZE = 100;

// 🐍 snakes
const snakes = {
  50: 5,
  43: 17,
  56: 8,
  68: 15,
  84: 58,
  87: 49,
  98: 40,
};

// 🪜 ladders
const ladders = {
  2: 23,
  6: 45,
  20: 59,
  52: 72,
  57: 96,
  71: 92,
};

// =========================
// HELPERS
// =========================
function getCoords(pos) {
  const index = pos - 1;
  const row = Math.floor(index / 10);
  let col = index % 10;

  if (row % 2 === 1) col = 9 - col;

  return {
    left: `${col * 10 + 5}%`,
    top: `${(9 - row) * 10 + 5}%`,
  };
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function applyEffects(pos) {
  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

// =========================
// COMPONENT
// =========================
export default function SnakeGame({ gameId }) {

  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({
    A: 1,
    B: 1
  });

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  // =========================
  // LOAD USER + GAME
  // =========================
  useEffect(() => {
    async function init() {
      const u = await account.get();
      setUser(u);

      const g = await databases.getDocument(
        DATABASE_ID,
        COLLECTION,
        gameId
      );

      setGame(g);

      setPositions(JSON.parse(g.positions || '{"A":1,"B":1}'));
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME SYNC (SOURCE OF TRUTH)
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTION}.documents.${gameId}`,
      (res) => {

        const g = res.payload;

        setGame(g);

        setPositions(JSON.parse(g.positions || '{"A":1,"B":1}'));
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // TURN CHECK
  // =========================
  const isMyTurn = game && user && game.turn === user.$id;

  // =========================
  // MOVE ANIMATION (NO BACKEND HERE)
  // =========================
  async function animate(playerKey, start, end) {

    let current = start;

    while (current < end) {

      await sleep(120);

      current++;

      setPositions(prev => ({
        ...prev,
        [playerKey]: current
      }));
    }

    const final = applyEffects(current);

    setPositions(prev => ({
      ...prev,
      [playerKey]: final
    }));

    return final;
  }

  // =========================
  // PLAY TURN
  // =========================
  async function play() {

    if (!game || !user || rolling) return;

    if (game.turn !== user.$id) return;

    setRolling(true);

    try {

      const playerKey =
        game.hostId === user.$id ? "A" : "B";

      const opponentId =
        game.hostId === user.$id
          ? game.opponentId
          : game.hostId;

      const current = JSON.parse(game.positions);

      const start = current[playerKey];

      const diceRoll = rollDice();

      setDice(diceRoll);

      let target = start + diceRoll;

      if (target > SIZE) target = SIZE;

      const final = await animate(playerKey, start, target);

      const winner = final >= SIZE ? user.$id : null;

      const updated = {
        ...current,
        [playerKey]: final
      };

      // =========================
      // SAVE FIRST (CRITICAL FIX)
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION,
        gameId,
        {
          positions: JSON.stringify(updated),
          turn: winner ? null : opponentId,
          status: winner ? "finished" : "running",
          winner: winner || ""
        }
      );

    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
    }
  }

  if (!game || !user) return null;

  return (
    <div style={styles.container}>

      <h2>🐍 Snake Game</h2>

      {/* TURN INDICATOR */}
      <p>
        {isMyTurn ? "🟢 Your Turn" : "⏳ Opponent Turn"}
      </p>

      {/* DICE */}
      <h3>🎲 {dice}</h3>

      {/* BOARD */}
      <div style={styles.board}>
        <img src={boardImg} style={{ width: "100%" }} />

        <div style={{
          position: "absolute",
          ...getCoords(positions.A),
          background: "red",
          width: 25,
          height: 25,
          borderRadius: "50%"
        }} />

        <div style={{
          position: "absolute",
          ...getCoords(positions.B),
          background: "blue",
          width: 25,
          height: 25,
          borderRadius: "50%"
        }} />
      </div>

      {/* BUTTON */}
      <button
        onClick={play}
        disabled={!isMyTurn || rolling}
        style={{
          marginTop: 20,
          padding: 12,
          background: isMyTurn ? "gold" : "gray"
        }}
      >
        🎲 Roll Dice
      </button>

    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    textAlign: "center",
    background: "#0f172a",
    color: "#fff",
    minHeight: "100vh",
    padding: 20
  },

  board: {
    position: "relative",
    width: 360,
    height: 360,
    margin: "auto"
  }
};