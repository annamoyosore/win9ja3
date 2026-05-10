import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID
} from "../lib/appwrite";

import boardImg from "./board.png";

// 🐍 Dedicated Snake Collection (DO NOT reuse Whot)
const SNAKE_GAME_COLLECTION = "snakegame";

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
  57: 96,
  52: 72,
  71: 92,
};

// =========================
// BOARD CALC
// =========================
function getCoords(pos = 1) {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// =========================
// GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [moving, setMoving] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState(1);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function loadGame() {
      try {
        const res = await databases.getDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId
        );
        setGame(res);
      } catch (err) {
        console.log("Load error:", err);
      }
    }

    loadGame();
  }, [gameId]);

  // =========================
  // LOGIC
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  // ✅ FIXED: 2 PLAYERS ONLY
  function nextTurn(turn) {
    return turn === "A" ? "B" : "A";
  }

  async function move(player, steps, positions) {
    let current = positions?.[player] || 1;

    for (let i = 0; i < steps; i++) {
      await sleep(120);
      current++;
      if (current > SIZE) current = SIZE;
    }

    return applyEffects(current);
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || moving || rolling) return;
    if (game.status === "finished") return;

    setMoving(true);
    setRolling(true);

    const player = game.turn;

    // 🎲 animation
    let spin = 0;
    const interval = setInterval(() => {
      setDice(Math.floor(Math.random() * 6) + 1);
      spin++;
      if (spin > 10) clearInterval(interval);
    }, 80);

    await sleep(900);

    const d = rollDice();
    setDice(d);
    setRolling(false);

    const positions = game.positions || { A: 1, B: 1 };

    const newPos = await move(player, d, positions);

    const updatedPositions = {
      ...positions,
      [player]: newPos,
    };

    // 🏆 WIN CONDITION
    let winner = "";
    if (newPos >= SIZE) {
      winner = player;
    }

    // 📜 HISTORY
    let history = game.history || [];

    history = [
      {
        player,
        dice: d,
        from: positions[player],
        to: newPos,
        time: Date.now(),
      },
      ...history,
    ].slice(0, 12);

    await databases.updateDocument(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION,
      gameId,
      {
        positions: updatedPositions,
        turn: nextTurn(player),
        winner,
        status: winner ? "finished" : "playing",
        history,
      }
    );

    setMoving(false);
  }

  // =========================
  // UI SAFE GUARD
  // =========================
  if (!game) return <div>Loading Snake Game...</div>;

  const positions = game.positions || { A: 1, B: 1 };

  return (
    <div style={styles.container}>
      <h2>🐍 Snake & Ladder (2 Players)</h2>

      <div style={styles.info}>
        🎲 Dice: {dice} <br />
        Turn: <b>{game.turn}</b> <br />
        Status: {game.status}
      </div>

      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(positions[p]),
              background: p === "A" ? "#ef4444" : "#3b82f6",
              opacity: game.turn === p ? 1 : 0.6,
              transform:
                game.turn === p
                  ? "translate(-50%, -50%) scale(1.3)"
                  : "translate(-50%, -50%)",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {game.winner && (
        <div style={styles.result}>
          🏆 Winner: {game.winner}
        </div>
      )}

      <div style={styles.history}>
        <h4>Last Moves</h4>
        {(game.history || []).map((h, i) => (
          <div key={i}>
            {h.player} 🎲{h.dice}: {h.from} → {h.to}
          </div>
        ))}
      </div>

      <button
        onClick={playTurn}
        disabled={moving || rolling || game.status === "finished"}
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
  board: {
    width: "100%",
    height: "100%",
  },
  token: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    color: "white",
    border: "2px solid white",
    transition: "0.3s",
  },
  info: { marginBottom: 10 },
  result: {
    marginTop: 10,
    padding: 10,
    background: "#1e293b",
    borderRadius: 10,
  },
  history: {
    marginTop: 15,
    fontSize: 13,
    background: "#111827",
    padding: 10,
    borderRadius: 10,
    maxWidth: 320,
    margin: "10px auto",
    textAlign: "left",
  },
};