import { useEffect, useState, useRef } from "react";
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function dice() {
  return Math.floor(Math.random() * 6) + 1;
}

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

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [diceValue, setDiceValue] = useState(1);

  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD USER + GAME
  // =========================
  useEffect(() => {
    async function init() {
      const u = await account.get();
      setUser(u);

      const res = await databases.getDocument(
        DATABASE_ID,
        COLLECTION,
        gameId
      );

      setGame(res);

      setPositions(JSON.parse(res.positions || '{"A":1,"B":1}'));
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME SYNC
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
  // CHECK TURN (BACKEND RULE)
  // =========================
  const isMyTurn = game?.turn === user?.$id;

  // =========================
  // MOVE LOGIC
  // =========================
  async function animateMove(playerKey, start, end) {
    let current = start;

    while (current < end) {
      await sleep(150);
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

    if (!isMyTurn) return;

    lock.current = true;
    setRolling(true);

    try {

      const currentPlayerKey =
        game.hostId === user.$id ? "A" : "B";

      const opponentId =
        game.hostId === user.$id
          ? game.opponentId
          : game.hostId;

      const currentPositions = JSON.parse(game.positions);

      const start = currentPositions[currentPlayerKey];

      const roll = dice();

      setDiceValue(roll);

      let end = start + roll;
      if (end > SIZE) end = SIZE;

      const final = await animateMove(
        currentPlayerKey,
        start,
        end
      );

      const nextTurn = opponentId;

      const updatedPositions = {
        ...currentPositions,
        [currentPlayerKey]: final
      };

      const winner = final >= SIZE ? user.$id : null;

      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION,
        gameId,
        {
          positions: JSON.stringify(updatedPositions),
          turn: winner ? null : nextTurn,
          winner: winner || "",
          status: winner ? "finished" : "running"
        }
      );

    } catch (e) {
      console.error(e);
    } finally {
      setRolling(false);
      lock.current = false;
    }
  }

  if (!game || !user) return null;

  const myKey =
    game.hostId === user.$id ? "A" : "B";

  return (
    <div style={{ textAlign: "center", background: "#0f172a", color: "white", minHeight: "100vh" }}>

      <h2>🐍 Snake Game</h2>

      <p>
        {isMyTurn ? "🟢 Your Turn" : "⏳ Opponent Turn"}
      </p>

      <p>🎲 Dice: {diceValue}</p>

      <div style={{ position: "relative", width: 360, height: 360, margin: "auto" }}>
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