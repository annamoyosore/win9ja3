import { useEffect, useState, useRef } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const GAME_COLLECTION = "snakegame";
const MATCH_COLLECTION = "snakelobby";
const WALLET_COLLECTION = "wallets";
const SIZE = 100;

// =========================
// GAME RULES
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
// SOUND
// =========================
function winSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const play = (f, t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.frequency.value = f;
      o.type = "sine";

      o.connect(g);
      g.connect(ctx.destination);

      o.start();
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t);

      setTimeout(() => o.stop(), t * 1000);
    };

    play(600, 0.2);
    setTimeout(() => play(900, 0.2), 150);
    setTimeout(() => play(1200, 0.3), 300);
  } catch {}
}

// =========================
// CONFETTI
// =========================
function fireConfetti() {
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

  const pieces = Array.from({ length: 100 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    r: Math.random() * 6 + 3,
    c: ["#facc15", "#22c55e", "#3b82f6", "#ef4444"][
      Math.floor(Math.random() * 4)
    ],
    speed: Math.random() * 4 + 2,
  }));

  let frame = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    pieces.forEach((p) => {
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y += p.speed;
    });

    frame++;
    if (frame < 120) requestAnimationFrame(draw);
    else canvas.remove();
  }

  draw();
}

// =========================
// MAIN COMPONENT
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");
  const [dice, setDice] = useState(1);

  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  const [winPopup, setWinPopup] = useState(null);
  const [countdown, setCountdown] = useState(5);

  const lock = useRef(false);
  const payoutLock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const res = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      setGame(res);

      setPositions(JSON.parse(res.positions || '{"A":1,"B":1}'));
      setTurn(res.turn);

      if (res.matchId) {
        const m = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          res.matchId
        );
        setMatch(m);
      }
    }

    load();
  }, [gameId]);

  // =========================
  // VALIDATE TURN
  // =========================
  async function validateTurn(player) {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId
    );

    return fresh.turn === player && fresh.status === "playing";
  }

  // =========================
  // MOVE
  // =========================
  async function move(player, steps) {
    let pos = positions[player];

    for (let i = 0; i < steps; i++) {
      await sleep(100);
      pos++;
      if (pos > SIZE) pos = SIZE;

      setPositions((p) => ({ ...p, [player]: pos }));
    }

    return applyEffects(pos);
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    const player = turn;

    if (!game || rolling || moving || lock.current) return;

    lock.current = true;
    setRolling(true);
    setMoving(true);

    try {
      const ok = await validateTurn(player);
      if (!ok) {
        alert("❌ Not your turn");
        return;
      }

      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(60);
      }

      const d = secureDice();
      setDice(d);

      const final = await move(player, d);

      const winner = final >= SIZE ? player : null;
      const nextTurn = player === "A" ? "B" : "A";

      const updated = {
        ...game,
        positions: JSON.stringify({
          ...positions,
          [player]: final,
        }),
        turn: winner ? null : nextTurn,
        status: winner ? "finished" : "playing",
        winner: winner || "",
        history: [
          `Player ${player} rolled ${d} → ${final}`,
          ...(game.history || []),
        ].slice(0, 6),
      };

      const res = await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        updated
      );

      setGame(res);
      setTurn(res.turn);

      // =========================
      // WIN EVENT
      // =========================
      if (winner) {
        const pot = match?.pot || 0;

        setWinPopup({ player: winner, amount: pot });

        winSound();
        fireConfetti();

        let t = 5;
        setCountdown(t);

        const interval = setInterval(() => {
          t--;
          setCountdown(t);
          if (t <= 0) clearInterval(interval);
        }, 1000);

        setTimeout(() => setWinPopup(null), 5000);

        if (!payoutLock.current) {
          payoutLock.current = true;

          await databases.updateDocument(
            DATABASE_ID,
            MATCH_COLLECTION,
            match.$id,
            {
              pot: 0,
              status: "finished",
              payoutDone: true,
            }
          );
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      setMoving(false);

      setTimeout(() => {
        lock.current = false;
      }, 500);
    }
  }

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.top}>
        <div>🎲 Dice: {dice}</div>
        <div>Turn: {turn}</div>
        <div>🏦 Pot: ₦{match?.pot || 0}</div>
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

      <button onClick={playTurn} disabled={rolling || moving}>
        🎲 Roll Dice
      </button>

      {winPopup && (
        <div style={styles.win}>
          🏆 Player {winPopup.player} Won ₦{winPopup.amount}
          <br />
          Paying out in {countdown}s...
        </div>
      )}

      <div style={styles.history}>
        {game.history?.map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>
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

  win: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "gold",
    color: "#000",
    padding: 20,
    borderRadius: 12,
    fontWeight: "bold",
    zIndex: 9999,
  },

  history: {
    marginTop: 10,
    fontSize: 12,
  },
};