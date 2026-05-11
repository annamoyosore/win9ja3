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

    ctx.font = "26px serif";

    pieces.forEach((p) => {
      ctx.fillText(p.emoji, p.x, p.y);

      p.y += p.speed;
    });

    frame++;

    if (frame < 180) {
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }

  draw();
}

// =========================
// MAIN
// =========================
export default function SnakeGame({
  gameId,
}) {
  const [user, setUser] = useState(null);

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

    async function init() {
      try {
        const loggedUser = await account.get();

        setUser(loggedUser);

        const gameDoc =
          await databases.getDocument(
            DATABASE_ID,
            SNAKE_GAME_COLLECTION,
            gameId
          );

        setGame(gameDoc);

        setTurn(gameDoc.turn || "A");

        setPositions(
          JSON.parse(
            gameDoc.positions ||
              '{"A":1,"B":1}'
          )
        );
      } catch (err) {
        console.error(err);
      }
    }

    init();
  }, [gameId]);

  // =========================
  // REALTIME
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

          setTurn(payload.turn || "A");

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
  // DETECT PLAYER
  // =========================
  let currentPlayer = null;

  if (user && game) {
    if (user.$id === game.hostId) {
      currentPlayer = "A";
    } else if (
      user.$id === game.opponentId
    ) {
      currentPlayer = "B";
    }
  }

  // =========================
  // TRUE TURN CHECK
  // =========================
  const isMyTurn =
    currentPlayer &&
    turn &&
    currentPlayer === turn;

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
  // MOVE TILE
  // =========================
  async function animateMove(
    player,
    start,
    end
  ) {
    let current = start;

    while (current < end) {
      await sleep(180);

      current++;

      setPositions((prev) => ({
        ...prev,
        [player]: current,
      }));
    }

    const effected =
      applyEffects(current);

    if (effected !== current) {
      await sleep(350);

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
      !user ||
      rolling ||
      lock.current
    ) {
      return;
    }

    if (game.status === "finished") {
      return;
    }

    // 🚫 BLOCK WRONG PLAYER
    if (!isMyTurn) {
      return alert(
        "❌ Wait for your turn"
      );
    }

    lock.current = true;

    setRolling(true);

    try {
      // fresh backend
      const fresh =
        await databases.getDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId
        );

      const backendTurn =
        fresh.turn;

      // backend verify
      const backendPlayer =
        user.$id === fresh.hostId
          ? "A"
          : user.$id ===
            fresh.opponentId
          ? "B"
          : null;

      if (
        !backendPlayer ||
        backendPlayer !== backendTurn
      ) {
        alert(
          "❌ Not your turn"
        );

        return;
      }

      // 🎲 animation
      for (let i = 0; i < 8; i++) {
        setDice(
          Math.floor(
            Math.random() * 6
          ) + 1
        );

        await sleep(70);
      }

      const rolled =
        secureDice();

      setDice(rolled);

      const currentPositions =
        JSON.parse(
          fresh.positions ||
            '{"A":1,"B":1}'
        );

      const startPos =
        currentPositions[
          backendTurn
        ];

      let endPos =
        startPos + rolled;

      if (endPos > SIZE) {
        endPos = SIZE;
      }

      // animate
      const finalPos =
        await animateMove(
          backendTurn,
          startPos,
          endPos
        );

      const winner =
        finalPos >= SIZE
          ? backendTurn
          : null;

      const nextTurn =
        backendTurn === "A"
          ? "B"
          : "A";

      const history =
        trimHistory([
          `Player ${backendTurn} rolled ${rolled} → ${finalPos}`,
          ...(fresh.history || []),
        ]);

      // SAVE
      const updated =
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId,
          {
            positions:
              JSON.stringify({
                ...currentPositions,
                [backendTurn]:
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

      setGame(updated);

      setTurn(updated.turn);

      setPositions(
        JSON.parse(
          updated.positions
        )
      );

      // =========================
      // WIN
      // =========================
      if (winner) {
        const pot = Number(
          fresh.pot || 0
        );

        const winnerUserId =
          winner === "A"
            ? fresh.hostId
            : fresh.opponentId;

        await payout(
          winnerUserId,
          pot
        );

        fireFlowers();

        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId,
          {
            pot: 0,
            payoutDone: true,
          }
        );

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
  if (!game || !user) {
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

      {/* CURRENT USER */}
      <div style={styles.meBox}>
        You Are:{" "}
        <span
          style={{
            color:
              currentPlayer === "A"
                ? "#ef4444"
                : "#3b82f6",
          }}
        >
          Player {currentPlayer}
        </span>
      </div>

      {/* TURN BOX */}
      <div style={styles.top}>
        <div
          style={{
            ...styles.playerBox,
            border:
              turn === "A"
                ? "2px solid lime"
                : "2px solid #334155",
          }}
        >
          🔴 Player A
          <div>
            {turn === "A"
              ? "🟢 TURN"
              : "⚪ WAIT"}
          </div>
        </div>

        <div
          style={{
            ...styles.playerBox,
            border:
              turn === "B"
                ? "2px solid lime"
                : "2px solid #334155",
          }}
        >
          🔵 Player B
          <div>
            {turn === "B"
              ? "🟢 TURN"
              : "⚪ WAIT"}
          </div>
        </div>
      </div>

      {/* YOUR STATUS */}
      <div style={styles.turnInfo}>
        {isMyTurn
          ? "🟢 Your Turn"
          : "⏳ Opponent Turn"}
      </div>

      {/* POT */}
      <div style={styles.pot}>
        🏦 Pot: ₦
        {Number(game?.pot || 0)}
      </div>

      {/* BOARD */}
      <div style={styles.boardWrapper}>
        <img
          src={boardImg}
          alt="board"
          style={styles.board}
        />

        <div
          style={{
            ...styles.token,
            ...getCoords(
              positions.A
            ),
            background: "#ef4444",
          }}
        >
          A
        </div>

        <div
          style={{
            ...styles.token,
            ...getCoords(
              positions.B
            ),
            background: "#3b82f6",
          }}
        >
          B
        </div>
      </div>

      {/* CONTROLS */}
      <div style={styles.controls}>
        <button
          onClick={playTurn}
          disabled={
            rolling ||
            !isMyTurn ||
            game.status ===
              "finished"
          }
          style={{
            ...styles.rollBtn,
            opacity:
              !isMyTurn ? 0.5 : 1,
          }}
        >
          {rolling
            ? "Rolling..."
            : isMyTurn
            ? "🎲 Roll Dice"
            : "⏳ Wait Turn"}
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

  meBox: {
    background: "#111827",
    padding: 10,
    borderRadius: 10,
    width: 200,
    margin: "0 auto 15px",
    fontWeight: "bold",
  },

  top: {
    display: "flex",
    justifyContent:
      "center",
    gap: 12,
    marginBottom: 15,
  },

  playerBox: {
    background: "#1e293b",
    padding: 10,
    borderRadius: 10,
    minWidth: 130,
    fontWeight: "bold",
  },

  turnInfo: {
    marginBottom: 12,
    fontWeight: "bold",
    fontSize: 18,
  },

  pot: {
    background: "#111827",
    padding: 12,
    borderRadius: 12,
    width: 220,
    margin: "0 auto 15px",
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
    transition:
      "all 0.18s linear",
    zIndex: 10,
  },

  controls: {
    display: "flex",
    justifyContent:
      "center",
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
    fontSize: 16,
  },

  diceBox: {
    background: "#1e293b",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: "bold",
    minWidth: 70,
    fontSize: 18,
  },

  history: {
    marginTop: 20,
    fontSize: 14,
    lineHeight: 1.8,
  },
};