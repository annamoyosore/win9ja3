import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query
} from "../lib/appwrite";

import boardImg from "./board.png";

const SNAKE_GAME_COLLECTION = "snakegame";
const SNAKE_LOBBY_COLLECTION = "snakelobby";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function secureDice() {
  const arr = new Uint8Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 6) + 1;
}

function applyEffects(pos) {
  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

function trimHistory(history = []) {
  return history.slice(0, 3);
}

// =========================
// FLOWERS
// =========================
function fireFlowers() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  canvas.style.position = "fixed";
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = 99999;

  const ctx = canvas.getContext("2d");

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const flowers = ["🌸", "🌺", "🌼", "💐"];

  const pieces = Array.from({ length: 120 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    emoji: flowers[Math.floor(Math.random() * flowers.length)],
    speed: Math.random() * 3 + 2,
  }));

  let frame = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "26px serif";

    pieces.forEach((p) => {
      ctx.fillText(p.emoji, p.x, p.y);
      p.y += p.speed;
    });

    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else canvas.remove();
  }

  draw();
}

// =========================
// MAIN COMPONENT
// =========================
export default function SnakeGame({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function init() {
      try {
        const u = await account.get();
        setUser(u);

        const res = await databases.getDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId
        );

        setGame(res);
        setTurn(res.turn || "A");
        setPositions(JSON.parse(res.positions || '{"A":1,"B":1}'));
      } catch (err) {
        console.error(err);
      }
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME SYNC
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${SNAKE_GAME_COLLECTION}.documents.${gameId}`,
      (response) => {
        const payload = response.payload;

        setGame(payload);
        setTurn(payload.turn || "A");
        setPositions(JSON.parse(payload.positions || '{"A":1,"B":1}'));
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // ROLE FIX (IMPORTANT)
  // =========================
  function myPlayer() {
    if (!user || !game) return null;

    // strict mapping
    if (game.hostId === user.$id) return "A";
    if (game.opponentId === user.$id) return "B";

    return null;
  }

  const currentPlayer = myPlayer();

  // 🔥 FIX: prevent both WAIT bug
  const isMyTurn =
    currentPlayer !== null &&
    currentPlayer !== undefined &&
    turn === currentPlayer;

  // =========================
  // MOVE ANIMATION
  // =========================
  async function animateMove(player, start, end) {
    let current = start;

    while (current < end) {
      await sleep(150);
      current++;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    const final = applyEffects(current);

    if (final !== current) {
      await sleep(300);
      setPositions((prev) => ({
        ...prev,
        [player]: final,
      }));
    }

    return final;
  }

  // =========================
  // PLAY TURN (FIXED)
  // =========================
  async function playTurn() {
    if (!game || !user || rolling || lock.current) return;
    if (game.status === "finished") return;

    if (!isMyTurn) {
      alert("❌ Not your turn");
      return;
    }

    lock.current = true;
    setRolling(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      const currentTurn = fresh.turn || "A";

      const positionsData = JSON.parse(
        fresh.positions || '{"A":1,"B":1}'
      );

      const startPos = positionsData[currentTurn];

      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(80);
      }

      const rolled = secureDice();
      setDice(rolled);

      let endPos = startPos + rolled;
      if (endPos > SIZE) endPos = SIZE;

      const finalPos = await animateMove(currentTurn, startPos, endPos);

      const winner = finalPos >= SIZE ? currentTurn : null;

      const nextTurn = currentTurn === "A" ? "B" : "A";

      const history = trimHistory([
        `Player ${currentTurn} rolled ${rolled} → ${finalPos}`,
        ...(fresh.history || [])
      ]);

      const updated = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...positionsData,
            [currentTurn]: finalPos,
          }),
          turn: winner ? null : nextTurn,
          status: winner ? "finished" : "running",
          winner: winner || "",
          history,
        }
      );

      setGame(updated);
      setTurn(updated.turn || "A");
      setPositions(JSON.parse(updated.positions));

      if (winner) {
        fireFlowers();
        alert(`🏆 Player ${winner} wins!`);

        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2500);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      setTimeout(() => (lock.current = false), 400);
    }
  }

  // =========================
  // UI
  // =========================
  if (!game) {
    return <div style={{ color: "#fff" }}>Loading...</div>;
  }

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN DISPLAY (FIXED) */}
      <div style={styles.top}>
        <div style={{ color: turn === "A" ? "lime" : "gray" }}>
          🔴 Player A {turn === "A" ? "YOUR TURN" : "WAIT"}
        </div>

        <div style={{ color: turn === "B" ? "lime" : "gray" }}>
          🔵 Player B {turn === "B" ? "YOUR TURN" : "WAIT"}
        </div>
      </div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        <div style={{ ...styles.token, ...getCoords(positions.A), background: "red" }}>A</div>
        <div style={{ ...styles.token, ...getCoords(positions.B), background: "blue" }}>B</div>
      </div>

      {/* BUTTON */}
      <button
        onClick={playTurn}
        disabled={!isMyTurn || rolling}
        style={{
          ...styles.button,
          opacity: isMyTurn ? 1 : 0.5,
        }}
      >
        {isMyTurn ? "🎲 Roll Dice" : "⏳ Wait Turn"}
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
    padding: 15,
  },

  top: {
    display: "flex",
    justifyContent: "space-around",
    marginBottom: 10,
    fontWeight: "bold",
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
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
  },

  button: {
    padding: "12px 18px",
    borderRadius: 10,
    border: "none",
    background: "gold",
    fontWeight: "bold",
    cursor: "pointer",
  },
};