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

  const emojis = ["🌸", "🌺", "🌼", "💐"];

  const items = Array.from({ length: 100 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    e: emojis[Math.floor(Math.random() * emojis.length)],
    speed: Math.random() * 3 + 2,
  }));

  let frame = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "24px serif";

    items.forEach((p) => {
      ctx.fillText(p.e, p.x, p.y);
      p.y += p.speed;
    });

    frame++;
    if (frame < 160) requestAnimationFrame(draw);
    else canvas.remove();
  }

  draw();
}

// =========================
// MAIN
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
  // LOAD
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function init() {
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
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${SNAKE_GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const g = res.payload;
        setGame(g);
        setTurn(g.turn || "A");
        setPositions(JSON.parse(g.positions || '{"A":1,"B":1}'));
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // 🔥 FIXED PLAYER MAPPING (IMPORTANT)
  // =========================
  const myPlayer =
    !user || !game
      ? null
      : user.$id === game.hostId
      ? "A"
      : user.$id === game.opponentId
      ? "B"
      : null;

  const isMyTurn = myPlayer === turn;

  // =========================
  // MOVE
  // =========================
  async function animateMove(player, start, end) {
    let pos = start;

    while (pos < end) {
      await sleep(150);
      pos++;
      setPositions((p) => ({ ...p, [player]: pos }));
    }

    const final = applyEffects(pos);
    setPositions((p) => ({ ...p, [player]: final }));

    return final;
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || !user || rolling || lock.current) return;

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

      const player = fresh.turn;

      if (player !== myPlayer) {
        alert("❌ Turn mismatch");
        return;
      }

      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(60);
      }

      const roll = secureDice();
      setDice(roll);

      const start = JSON.parse(fresh.positions)[player];
      let end = start + roll;

      if (end > SIZE) end = SIZE;

      const final = await animateMove(player, start, end);

      const winner = final >= SIZE ? player : null;
      const next = player === "A" ? "B" : "A";

      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...JSON.parse(fresh.positions),
            [player]: final,
          }),
          turn: winner ? null : next,
          status: winner ? "finished" : "running",
          winner: winner || ""
        }
      );

      if (winner) {
        fireFlowers();
        alert(`🏆 Player ${winner} wins!`);

        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2500);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setRolling(false);
      setTimeout(() => (lock.current = false), 400);
    }
  }

  if (!game || !user) return <div style={{ color: "#fff" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.turnBox}>
        You are: <b>{myPlayer}</b> <br />
        Turn: <b>{turn}</b> <br />
        {isMyTurn ? "🟢 Your Turn" : "⏳ Opponent Turn"}
      </div>

      <div style={styles.board}>
        <img src={boardImg} style={{ width: "100%" }} />

        <div style={{ ...styles.token, ...getCoords(positions.A), background: "red" }}>A</div>
        <div style={{ ...styles.token, ...getCoords(positions.B), background: "blue" }}>B</div>
      </div>

      <button onClick={playTurn} disabled={!isMyTurn || rolling} style={styles.btn}>
        {rolling ? "Rolling..." : isMyTurn ? "🎲 Roll Dice" : "Wait Turn"}
      </button>

      <div>🎲 {dice}</div>
    </div>
  );
}

const styles = {
  container: { textAlign: "center", background: "#0f172a", color: "#fff", minHeight: "100vh", padding: 15 },
  board: { position: "relative", width: 360, height: 360, margin: "20px auto" },
  token: { position: "absolute", width: 28, height: 28, borderRadius: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#fff" },
  btn: { padding: 12, borderRadius: 10, background: "gold", fontWeight: "bold" },
  turnBox: { background: "#1e293b", padding: 10, margin: "10px auto", width: 220, borderRadius: 10 }
};