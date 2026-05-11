import { useEffect, useState, useRef } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const GAME_COLLECTION = "snakegame";
const MATCH_COLLECTION = "snakelobby";
const SIZE = 100;

// =========================
// RULES
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
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState(null);
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
        GAME_COLLECTION,
        gameId
      );

      setGame(res);
      setTurn(res.turn);

      setPositions(JSON.parse(res.positions || '{"A":1,"B":1}'));

      if (res.lobbyId) {
        const m = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          res.lobbyId
        );
        setMatch(m);
      }
    }

    load();
  }, [gameId]);

  // =========================
  // REFRESH GAME
  // =========================
  async function refreshGame() {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId
    );

    setGame(fresh);
    setTurn(fresh.turn);

    return fresh;
  }

  // =========================
  // FIXED MOVE SYSTEM (NO TILE BUG)
  // =========================
  async function move(player, steps) {
    let currentPos = null;

    setPositions((prev) => {
      currentPos = prev[player];
      return prev;
    });

    await sleep(50);

    for (let i = 0; i < steps; i++) {
      await sleep(120);

      currentPos += 1;
      if (currentPos > SIZE) currentPos = SIZE;

      setPositions((prev) => ({
        ...prev,
        [player]: currentPos,
      }));
    }

    // 🐍 APPLY SNAKES/LADDERS AFTER MOVE
    const final = applyEffects(currentPos);

    setPositions((prev) => ({
      ...prev,
      [player]: final,
    }));

    return final;
  }

  // =========================
  // PLAY TURN (SERVER CONTROLLED)
  // =========================
  async function playTurn() {
    if (!game || rolling || moving || lock.current) return;

    lock.current = true;
    setRolling(true);
    setMoving(true);

    try {
      const fresh = await refreshGame();

      if (fresh.status !== "running") return;

      const player = fresh.turn; // 🟢 ALWAYS SERVER TURN

      if (!player) return;

      // 🎲 dice animation
      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(60);
      }

      const d = secureDice();
      setDice(d);

      const finalPos = await move(player, d);

      const winner = finalPos >= SIZE ? player : null;
      const nextTurn = player === "A" ? "B" : "A";

      const updated = {
        positions: JSON.stringify({
          ...positions,
          [player]: finalPos,
        }),
        turn: winner ? null : nextTurn,
        status: winner ? "finished" : "running",
        winner: winner || "",
        history: [
          `Player ${player} rolled ${d} → ${finalPos}`,
          ...(fresh.history || []),
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
      // WIN + POT SAFE
      // =========================
      if (winner) {
        const pot = Number(res.pot || 0);

        alert(`🏆 Player ${winner} wins ₦${pot}`);

        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId,
          {
            status: "finished",
            winner,
            payoutDone: true,
          }
        );
      }

    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      setMoving(false);

      setTimeout(() => {
        lock.current = false;
      }, 400);
    }
  }

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  const safePositions = {
    A: positions?.A || 1,
    B: positions?.B || 1,
  };

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.top}>
        <div>🎲 Dice: {dice}</div>
        <div>
          Turn: {turn === game.hostId ? "Player A" : "Player B"}
        </div>
        <div>🏦 Pot: ₦{game?.pot || 0}</div>
      </div>

      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        {["A", "B"].map((p) => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(safePositions[p]),
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

      {game.history?.map((h, i) => (
        <div key={i}>{h}</div>
      ))}
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

  board: {
    width: "100%",
    height: "100%",
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
  },
};