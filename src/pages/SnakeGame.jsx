import { useEffect, useState } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const GAME = "snakegame";
const SIZE = 100;

const snakes = { 50: 5, 43: 17, 56: 8, 68: 15, 84: 58, 87: 49, 98: 40 };
const ladders = { 2: 23, 6: 45, 20: 59, 57: 96, 52: 72, 71: 92 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// safe recursive apply
function applyEffects(pos) {
  let current = pos;

  while (snakes[current] || ladders[current]) {
    if (snakes[current]) current = snakes[current];
    if (ladders[current]) current = ladders[current];
  }

  return current;
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function safeParse(data) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return { A: 1, B: 1 };
  }
}

export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");
  const [dice, setDice] = useState(1);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    load();
  }, [gameId]);

  async function load() {
    const res = await databases.getDocument(
      DATABASE_ID,
      GAME,
      gameId
    );

    setGame(res);
    setPositions(safeParse(res.positions) || { A: 1, B: 1 });
    setTurn(res.turn || "A");
  }

  async function playTurn() {
    if (!game || moving || game.status === "finished") return;

    setMoving(true);

    const player = turn;
    const diceValue = rollDice();
    setDice(diceValue);

    let current = positions[player];

    // 🎯 animate movement
    for (let i = 0; i < diceValue; i++) {
      await sleep(120);
      current += 1;
      if (current > SIZE) current = SIZE;

      setPositions((p) => ({
        ...p,
        [player]: current,
      }));
    }

    const finalPos = applyEffects(current);

    setPositions((p) => ({
      ...p,
      [player]: finalPos,
    }));

    const winner = finalPos >= SIZE ? player : "";

    const updated = {
      ...game,
      positions: JSON.stringify({
        ...positions,
        [player]: finalPos,
      }),
      turn: player === "A" ? "B" : "A",
      status: winner ? "finished" : "playing",
      winner,
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updated
    );

    setGame(updated);
    setTurn(updated.turn);

    setMoving(false);
  }

  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div>
        🎲 Dice: {dice} <br />
        Turn: <b>{turn}</b>
      </div>

      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(positions[p]),
              background: p === "A" ? "red" : "blue",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      <button onClick={playTurn} disabled={moving}>
        🎲 Roll Dice
      </button>

      {game.winner && (
        <h3>🏆 Winner: Player {game.winner}</h3>
      )}
    </div>
  );
}

const styles = {
  container: {
    textAlign: "center",
    background: "#0f172a",
    color: "white",
    minHeight: "100vh",
    padding: 20,
  },
  boardWrapper: {
    position: "relative",
    width: 360,
    height: 360,
    margin: "20px auto",
  },
  board: { width: "100%", height: "100%" },
  token: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    color: "white",
    border: "2px solid white",
    transition: "0.25s linear",
  },
};