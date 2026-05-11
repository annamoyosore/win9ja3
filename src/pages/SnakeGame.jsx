import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query
} from "../lib/appwrite";

import boardImg from "./board.png";

const GAME_COLLECTION = "snakegame";
const SIZE = 100;

// 🐍 Snakes
const snakes = {
  50: 5,
  43: 17,
  56: 8,
  68: 15,
  84: 58,
  87: 49,
  98: 40,
};

// 🪜 Ladders
const ladders = {
  2: 23,
  6: 45,
  20: 59,
  52: 72,
  57: 96,
  71: 92,
};

// =====================
// HELPERS
// =====================
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function applyEffects(pos) {
  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

// =====================
// MAIN COMPONENT
// =====================
export default function SnakeGame({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);
  const [positions, setPositions] = useState({});

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =====================
  // LOAD USER + GAME
  // =====================
  useEffect(() => {
    async function init() {
      const u = await account.get();
      setUser(u);

      const g = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const parsed = {
        ...g,
        positions: g.positions
          ? JSON.parse(g.positions)
          : { hostId: 1, opponentId: 1 }
      };

      setGame(parsed);
      setPositions(parsed.positions);
    }

    init();
  }, [gameId]);

  // =====================
  // MY TURN CHECK
  // =====================
  const isMyTurn =
    game?.turn === user?.$id;

  const myKey =
    game?.hostId === user?.$id ? "hostId" : "opponentId";

  const opponentKey =
    myKey === "hostId" ? "opponentId" : "hostId";

  // =====================
  // MOVE ANIMATION
  // =====================
  async function animateMove(playerKey, start, end) {
    let current = start;

    while (current < end) {
      await sleep(200);
      current++;

      setPositions((prev) => ({
        ...prev,
        [playerKey]: current
      }));
    }

    const final = applyEffects(current);

    setPositions((prev) => ({
      ...prev,
      [playerKey]: final
    }));

    return final;
  }

  // =====================
  // PLAY TURN
  // =====================
  async function playTurn() {
    if (!game || !user || rolling || lock.current) return;
    if (!isMyTurn) return;

    lock.current = true;
    setRolling(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      const currentPos = JSON.parse(fresh.positions || "{}");

      // 🎲 animation roll
      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(80);
      }

      const rolled = rollDice();
      setDice(rolled);

      const start = currentPos[myKey] || 1;

      let end = start + rolled;
      if (end > SIZE) end = SIZE;

      const finalPos = await animateMove(myKey, start, end);

      const winner = finalPos >= SIZE ? user.$id : null;

      const nextTurn =
        fresh.turn === fresh.hostId
          ? fresh.opponentId
          : fresh.hostId;

      const history = [
        ...(fresh.history || []),
        `Player ${user.name || user.$id} rolled ${rolled} → ${finalPos}`
      ].slice(-10);

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...currentPos,
            [myKey]: finalPos
          }),
          turn: winner ? null : nextTurn,
          winner: winner || "",
          status: winner ? "finished" : "running",
          history
        }
      );

    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      lock.current = false;
    }
  }

  // =====================
  // UI
  // =====================
  if (!game || !user) return <div style={{ color: "#fff" }}>Loading...</div>;

  const posHost = getCoords(positions.hostId || 1);
  const posOpp = getCoords(positions.opponentId || 1);

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        <div style={{ ...styles.token, ...posHost, background: "red" }}>A</div>
        <div style={{ ...styles.token, ...posOpp, background: "blue" }}>B</div>
      </div>

      <div style={styles.diceBox}>
        🎲 {dice}
      </div>

      <button
        onClick={playTurn}
        disabled={!isMyTurn || rolling}
        style={{
          ...styles.button,
          opacity: isMyTurn ? 1 : 0.5
        }}
      >
        {rolling ? "Rolling..." : "Roll Dice"}
      </button>

      <p style={{ color: "white" }}>
        {isMyTurn ? "Your turn" : "Opponent turn"}
      </p>
    </div>
  );
}

// =====================
const styles = {
  container: {
    textAlign: "center",
    background: "#0f172a",
    minHeight: "100vh",
    color: "#fff",
    padding: 20
  },
  boardWrapper: {
    position: "relative",
    width: 360,
    height: 360,
    margin: "20px auto"
  },
  board: {
    width: "100%",
    height: "100%"
  },
  token: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    color: "#fff"
  },
  diceBox: {
    marginTop: 10,
    fontSize: 22
  },
  button: {
    marginTop: 10,
    padding: "10px 20px",
    background: "gold",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer"
  }
};