import { useEffect, useState, useRef } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const SNAKE_GAME_COLLECTION = "snakegame";
const SNAKE_LOBBY_COLLECTION = "snakelobby";
const WALLET_COLLECTION = "wallets";

const SIZE = 100;

// =========================
// BOARD RULES
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
// 🎉 FLOWERS ANIMATION
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

  const emojis = ["🌸", "🌺", "🌼", "💐", "🌷"];

  const pieces = Array.from({ length: 90 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
    speed: Math.random() * 3 + 2,
  }));

  let frame = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "22px serif";

    pieces.forEach((p) => {
      ctx.fillText(p.emoji, p.x, p.y);
      p.y += p.speed;
    });

    frame++;
    if (frame < 140) requestAnimationFrame(draw);
    else canvas.remove();
  }

  draw();
}

// =========================
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");
  const [dice, setDice] = useState(1);

  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const res = await databases.getDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId
      );

      setGame(res);
      setTurn(res.turn);
      setPositions(JSON.parse(res.positions || '{"A":1,"B":1}'));
    }

    load();
  }, [gameId]);

  // =========================
  // MOVE PLAYER
  // =========================
  async function move(player, steps) {
    let pos = positions[player];

    for (let i = 0; i < steps; i++) {
      await sleep(120);
      pos++;
      if (pos > SIZE) pos = SIZE;

      setPositions((p) => ({ ...p, [player]: pos }));
    }

    return applyEffects(pos);
  }

  // =========================
  // PAYOUT WINNER
  // =========================
  async function payout(winnerUserId, pot) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", winnerUserId), Query.limit(1)]
    );

    if (res.documents.length) {
      const w = res.documents[0];

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        w.$id,
        {
          balance: Number(w.balance || 0) + pot,
        }
      );
    }
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || rolling || moving || lock.current) return;

    lock.current = true;
    setRolling(true);
    setMoving(true);

    try {
      const player = turn;

      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(60);
      }

      const d = secureDice();
      setDice(d);

      const final = await move(player, d);

      const winner = final >= SIZE ? player : null;
      const nextTurn = player === "A" ? "B" : "A";

      const updated = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...positions,
            [player]: final,
          }),
          turn: winner ? null : nextTurn,
          status: winner ? "finished" : "running",
          winner: winner || "",
        }
      );

      setGame(updated);
      setTurn(updated.turn);

      // =========================
      // WIN FLOW
      // =========================
      if (winner) {
        const pot = Number(updated.pot || 0);

        const winnerUserId =
          winner === "A" ? game.hostId : game.opponentId;

        alert(`🏆 Player ${winner} wins ₦${pot}`);

        // 💰 PAY WINNER
        await payout(winnerUserId, pot);

        // 🌸 ANIMATION
        fireFlowers();

        // 🏁 CLOSE GAME
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId,
          {
            status: "finished",
            pot: 0,
            payoutDone: true,
          }
        );

        // 🏁 CLOSE LOBBY
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          game.lobbyId,
          {
            status: "finished",
          }
        );

        // 🚪 BACK TO DASHBOARD
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      setMoving(false);
      setTimeout(() => (lock.current = false), 400);
    }
  }

  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.top}>
        <div>🎲 Dice: {dice}</div>
        <div>Turn: {turn}</div>
        <div>🏦 Pot: ₦{game?.pot || 0}</div>
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
};