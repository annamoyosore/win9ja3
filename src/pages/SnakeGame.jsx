import { useEffect, useState, useRef } from "react";
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

  if (row % 2 === 1) {
    col = 9 - col;
  }

  return {
    left: `${col * 10 + 5}%`,
    top: `${(9 - row) * 10 + 5}%`,
  };
}

const sleep = (ms) =>
  new Promise((r) => setTimeout(r, ms));

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
// WIN FLOWERS
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

  const pieces = Array.from({ length: 100 }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    emoji:
      flowers[
        Math.floor(Math.random() * flowers.length)
      ],
    speed: Math.random() * 3 + 2,
  }));

  let frame = 0;

  function draw() {
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.font = "24px serif";

    pieces.forEach((p) => {
      ctx.fillText(p.emoji, p.x, p.y);

      p.y += p.speed;
    });

    frame++;

    if (frame < 160) {
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }

  draw();
}

// =========================
// MAIN COMPONENT
// =========================
export default function SnakeGame({
  gameId,
}) {
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({
    A: 1,
    B: 1,
  });

  const [turn, setTurn] = useState("A");

  const [dice, setDice] = useState(1);

  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function loadGame() {
      try {
        const res =
          await databases.getDocument(
            DATABASE_ID,
            SNAKE_GAME_COLLECTION,
            gameId
          );

        setGame(res);

        setTurn(res.turn || "A");

        setPositions(
          JSON.parse(
            res.positions ||
              '{"A":1,"B":1}'
          )
        );
      } catch (err) {
        console.error(err);
      }
    }

    loadGame();
  }, [gameId]);

  // =========================
  // REALTIME GAME SYNC
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub =
      databases.client.subscribe(
        `databases.${DATABASE_ID}.collections.${SNAKE_GAME_COLLECTION}.documents.${gameId}`,
        (response) => {
          const payload =
            response.payload;

          setGame(payload);

          setTurn(payload.turn);

          setPositions(
            JSON.parse(
              payload.positions ||
                '{"A":1,"B":1}'
            )
          );
        }
      );

    return () => unsub();
  }, [gameId]);

  // =========================
  // PAYOUT
  // =========================
  async function payout(
    userId,
    amount
  ) {
    try {
      const walletRes =
        await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal(
              "userId",
              userId
            ),
            Query.limit(1),
          ]
        );

      if (
        !walletRes.documents.length
      )
        return;

      const wallet =
        walletRes.documents[0];

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance:
            Number(
              wallet.balance || 0
            ) + Number(amount || 0),
        }
      );
    } catch (err) {
      console.error(err);
    }
  }

  // =========================
  // ANIMATE TILE
  // =========================
  async function animateMove(
    player,
    start,
    end
  ) {
    let current = start;

    while (current < end) {
      await sleep(120);

      current++;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    const effected =
      applyEffects(end);

    // snake / ladder jump
    if (effected !== end) {
      await sleep(400);

      setPositions((prev) => ({
        ...prev,
        [player]: effected,
      }));
    }

    return effected;
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (
      !game ||
      rolling ||
      lock.current
    )
      return;

    if (game.status === "finished")
      return;

    lock.current = true;

    setRolling(true);

    try {
      // 🔄 fresh backend game
      const fresh =
        await databases.getDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId
        );

      const currentTurn =
        fresh.turn;

      if (!currentTurn) {
        setRolling(false);
        return;
      }

      // 🎲 dice animation
      for (let i = 0; i < 8; i++) {
        setDice(
          Math.floor(
            Math.random() * 6
          ) + 1
        );

        await sleep(70);
      }

      // 🎲 final dice
      const rolled =
        secureDice();

      setDice(rolled);

      // 📍 positions
      const currentPositions =
        JSON.parse(
          fresh.positions ||
            '{"A":1,"B":1}'
        );

      const startPos =
        currentPositions[
          currentTurn
        ];

      let endPos =
        startPos + rolled;

      if (endPos > SIZE) {
        endPos = SIZE;
      }

      // 🎬 animate move
      const finalPos =
        await animateMove(
          currentTurn,
          startPos,
          endPos
        );

      // 🏆 winner?
      const winner =
        finalPos >= SIZE
          ? currentTurn
          : null;

      // 🔄 next turn
      const nextTurn =
        currentTurn === "A"
          ? "B"
          : "A";

      // 🧾 last 3 moves
      const history =
        trimHistory([
          `Player ${currentTurn} rolled ${rolled} → ${finalPos}`,
          ...(fresh.history || []),
        ]);

      // =========================
      // SAVE BACKEND
      // =========================
      const updated =
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId,
          {
            positions:
              JSON.stringify({
                ...currentPositions,
                [currentTurn]:
                  finalPos,
              }),

            turn: winner
              ? null
              : nextTurn,

            status: winner
              ? "finished"
              : "running",

            winner:
              winner || "",

            history,
          }
        );

      // =========================
      // UPDATE FRONTEND
      // =========================
      setGame(updated);

      setTurn(updated.turn);

      setPositions(
        JSON.parse(
          updated.positions
        )
      );

      // =========================
      // WIN FLOW
      // =========================
      if (winner) {
        const pot = Number(
          fresh.pot || 0
        );

        const winnerUserId =
          winner === "A"
            ? fresh.hostId
            : fresh.opponentId;

        // 💰 payout
        await payout(
          winnerUserId,
          pot
        );

        // 🌸 flowers
        fireFlowers();

        // 🏁 game close
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId,
          {
            pot: 0,
            payoutDone: true,
          }
        );

        // 🏁 lobby close
        if (fresh.lobbyId) {
          await databases.updateDocument(
            DATABASE_ID,
            SNAKE_LOBBY_COLLECTION,
            fresh.lobbyId,
            {
              status:
                "finished",
            }
          );
        }

        alert(
          `🏆 Player ${winner} won ₦${pot}`
        );

        setTimeout(() => {
          window.location.href =
            "/dashboard";
        }, 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);

      setTimeout(() => {
        lock.current = false;
      }, 500);
    }
  }

  // =========================
  // LOADING
  // =========================
  if (!game) {
    return (
      <div
        style={{
          color: "#fff",
          padding: 20,
        }}
      >
        Loading...
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      {/* TURN INDICATORS */}
      <div style={styles.top}>
        <div>
          🔴 Player A{" "}
          <span
            style={{
              color:
                turn === "A"
                  ? "lime"
                  : "gray",
            }}
          >
            ●
          </span>
        </div>

        <div>
          🔵 Player B{" "}
          <span
            style={{
              color:
                turn === "B"
                  ? "lime"
                  : "gray",
            }}
          >
            ●
          </span>
        </div>

        <div>
          🏦 ₦
          {game?.pot || 0}
        </div>
      </div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img
          src={boardImg}
          alt="board"
          style={styles.board}
        />

        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(
                positions[p]
              ),
              background:
                p === "A"
                  ? "red"
                  : "blue",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* CONTROLS */}
      <div style={styles.controls}>
        <button
          onClick={playTurn}
          disabled={rolling}
          style={styles.rollBtn}
        >
          {rolling
            ? "Rolling..."
            : "🎲 Roll Dice"}
        </button>

        <div style={styles.diceBox}>
          🎲 {dice}
        </div>
      </div>

      {/* HISTORY */}
      <div style={styles.history}>
        <h3>Last Moves</h3>

        {game.history?.map(
          (h, i) => (
            <div key={i}>
              {h}
            </div>
          )
        )}
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
    justifyContent:
      "space-around",
    marginBottom: 12,
    fontWeight: "bold",
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
    transform:
      "translate(-50%, -50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    color: "#fff",
    border: "2px solid #fff",
  },

  controls: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },

  rollBtn: {
    padding: "12px 18px",
    borderRadius: 10,
    border: "none",
    background: "gold",
    fontWeight: "bold",
    cursor: "pointer",
  },

  diceBox: {
    background: "#1e293b",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: "bold",
    minWidth: 70,
  },

  history: {
    marginTop: 20,
    fontSize: 14,
  },
};