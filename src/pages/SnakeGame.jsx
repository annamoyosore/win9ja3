import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  Query
} from "../lib/appwrite";

import boardImg from "./board.png";

const SNAKE_GAME_COLLECTION = "snakegame";
const SNAKE_LOBBY_COLLECTION = "snakelobby";
const WALLET_COLLECTION = "wallets";

const SIZE = 100;

// =========================
// SNAKES & LADDERS
// =========================
const snakes = {
  50: 5,
  43: 17,
  56: 8,
  68: 15,
  84: 58,
  87: 49,
  98: 40,
};

const ladders = {
  2: 23,
  6: 45,
  20: 59,
  57: 96,
  52: 72,
  71: 92,
};

// =========================
// BOARD POSITION
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

// =========================
// HELPERS
// =========================
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeParse(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

// =========================
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    loadGame();
  }, [gameId]);

  async function loadGame() {
    try {
      const res = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );
      setGame(res);
    } catch (err) {
      console.log(err);
    }
  }

  // =========================
  // APPLY EFFECTS
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  function nextTurn(turn) {
    return turn === "A" ? "B" : "A";
  }

  // =========================
  // MOVE ANIMATION
  // =========================
  async function movePiece(start, steps) {
    let current = start;

    for (let i = 0; i < steps; i++) {
      await sleep(120);
      current++;
      if (current > SIZE) current = SIZE;
      setTempPositions((prev) => ({ ...prev }));
    }

    return applyEffects(current);
  }

  // temporary UI sync fix
  const [tempPositions, setTempPositions] = useState({ A: 1, B: 1 });

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || rolling || moving) return;
    if (game.status === "finished") return;

    setMoving(true);
    setRolling(true);

    // 🎲 dice animation
    for (let i = 0; i < 10; i++) {
      setDice(Math.floor(Math.random() * 6) + 1);
      await sleep(80);
    }

    const d = rollDice();
    setDice(d);
    setRolling(false);

    const player = game.turn;
    const positions = safeParse(game.positions, { A: 1, B: 1 });

    const from = positions[player];

    const to = await movePiece(from, d);
    const updatedPos = { ...positions, [player]: to };

    const winner = to >= SIZE ? player : "";

    const history = safeParse(game.history, []);

    const updatedHistory = [
      {
        player: player === "A" ? "Player A" : "Player B",
        dice: d,
        from,
        to,
        time: Date.now(),
      },
      ...history
    ].slice(0, 6); // ✅ ONLY LAST 6 MOVES

    const updatedGame = {
      ...game,
      positions: updatedPos,
      turn: winner ? game.turn : nextTurn(game.turn),
      winner,
      status: winner ? "finished" : "playing",
      history: updatedHistory
    };

    await databases.updateDocument(
      DATABASE_ID,
      SNAKE_GAME_COLLECTION,
      gameId,
      updatedGame
    );

    setGame(updatedGame);

    // =========================
    // PAYOUT
    // =========================
    if (winner) {
      await payoutWinner(updatedGame, winner);
    }

    setMoving(false);
  }

  // =========================
  // PAYOUT SYSTEM
  // =========================
  async function payoutWinner(gameData, winner) {
    try {
      const players = safeParse(gameData.players, ["A", "B"]);

      const winnerIndex = winner === "A" ? 0 : 1;
      const winnerId = players[winnerIndex];

      const walletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", winnerId)]
      );

      if (walletRes.documents.length) {
        const wallet = walletRes.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          wallet.$id,
          {
            balance: Number(wallet.balance) + Number(gameData.pot)
          }
        );
      }

      // optional: set pot to zero
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          pot: 0,
          payoutDone: true,
          status: "finished"
        }
      );

    } catch (err) {
      console.log("Payout error:", err);
    }
  }

  if (!game) return <div style={{ color: "white" }}>Loading...</div>;

  const positions = safeParse(game.positions, { A: 1, B: 1 });

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN INDICATOR */}
      <div style={styles.turnBox}>
        <span
          style={{
            color: game.turn === "A" ? "lime" : "gray",
            fontWeight: "bold"
          }}
        >
          Player A
        </span>
        {"  VS  "}
        <span
          style={{
            color: game.turn === "B" ? "deepskyblue" : "gray",
            fontWeight: "bold"
          }}
        >
          Player B
        </span>
      </div>

      {/* DICE */}
      <div style={styles.dice}>{dice}</div>

      {/* BOARD */}
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

      {/* HISTORY */}
      <div style={styles.history}>
        {safeParse(game.history, []).map((h, i) => (
          <div key={i}>
            {h.player} 🎲{h.dice}: {h.from} → {h.to}
          </div>
        ))}
      </div>

      {/* BUTTON */}
      <button
        onClick={playTurn}
        disabled={rolling || moving || game.status === "finished"}
        style={styles.button}
      >
        🎲 Roll Dice
      </button>

      {game.winner && (
        <h3 style={{ color: "gold" }}>
          🏆 Winner: Player {game.winner}
        </h3>
      )}
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
    color: "white"
  },
  turnBox: {
    marginBottom: 10,
    fontSize: 18
  },
  dice: {
    fontSize: 40,
    marginBottom: 10
  },
  history: {
    background: "#111827",
    padding: 10,
    borderRadius: 10,
    maxWidth: 300,
    margin: "10px auto",
    textAlign: "left"
  },
  button: {
    padding: 12,
    borderRadius: 10,
    background: "gold",
    border: "none",
    fontWeight: "bold"
  }
};