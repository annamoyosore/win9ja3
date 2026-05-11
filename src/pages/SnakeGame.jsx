import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query
} from "../lib/appwrite";

import boardImg from "./board.png";

// =========================
// COLLECTIONS
// =========================
const GAME_COLLECTION = "snakegame";
const SNAKE_LOBBY_COLLECTION = "snakelobby";
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

function rollDice() {
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
// MAIN COMPONENT
// =========================
export default function SnakeGameRoom({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function init() {
      const u = await account.get();
      setUser(u);

      const res = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      setGame(res);
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
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const g = res.payload;
        setGame(g);
        setPositions(JSON.parse(g.positions || '{"A":1,"B":1}'));
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // TURN LOGIC (NEW SYSTEM)
  // =========================
  const isMyTurn =
    game &&
    user &&
    game.turn === user.$id;

  const myRole =
    game?.hostId === user?.$id
      ? "HOST"
      : game?.opponentId === user?.$id
      ? "OPPONENT"
      : null;

  // =========================
  // PAYOUT
  // =========================
  async function payout(userId, amount) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", userId),
        Query.limit(1),
      ]
    );

    if (!res.documents.length) return;

    const wallet = res.documents[0];

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance:
          Number(wallet.balance || 0) + Number(amount || 0),
      }
    );
  }

  // =========================
  // MOVE ANIMATION
  // =========================
  async function animateMove(player, start, end) {
    let pos = start;

    while (pos < end) {
      await sleep(120);
      pos++;

      setPositions((p) => ({
        ...p,
        [player]: pos,
      }));
    }

    const final = applyEffects(pos);

    setPositions((p) => ({
      ...p,
      [player]: final,
    }));

    return final;
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    if (!game || !user || rolling || lock.current) return;
    if (!isMyTurn) return;

    lock.current = true;
    setRolling(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      if (fresh.turn !== user.$id) {
        alert("❌ Not your turn");
        return;
      }

      const roll = rollDice();
      setDice(roll);

      const parsed = JSON.parse(fresh.positions || '{"A":1,"B":1}');

      const currentPos = parsed[user.$id === fresh.hostId ? "A" : "B"];

      let end = currentPos + roll;
      if (end > SIZE) end = SIZE;

      const finalPos = await animateMove(
        user.$id === fresh.hostId ? "A" : "B",
        currentPos,
        end
      );

      const winner = finalPos >= SIZE ? user.$id : null;

      const nextTurn =
        user.$id === fresh.hostId
          ? fresh.opponentId
          : fresh.hostId;

      const history = trimHistory([
        `Player rolled ${roll} → ${finalPos}`,
        ...(fresh.history || []),
      ]);

      const updated = await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...parsed,
            [user.$id === fresh.hostId ? "A" : "B"]: finalPos,
          }),

          turn: winner ? null : nextTurn,
          status: winner ? "finished" : "running",
          winner: winner || "",
          history,
        }
      );

      setGame(updated);
      setPositions(JSON.parse(updated.positions));

      // =========================
      // WIN + PAYOUT
      // =========================
      if (winner) {
        const pot = Number(fresh.pot || 0);

        await payout(user.$id, pot);

        await databases.updateDocument(
          DATABASE_ID,
          GAME_COLLECTION,
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
              status: "finished",
            }
          );
        }

        alert(`🏆 You won ₦${pot}`);

        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      setTimeout(() => (lock.current = false), 300);
    }
  }

  // =========================
  // UI
  // =========================
  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  const playerKey = user?.$id === game?.hostId ? "A" : "B";

  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.top}>
        <div>🎮 You are Player {playerKey}</div>
      </div>

      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        <div style={{ ...styles.token, ...getCoords(positions.A), background: "red" }}>
          A
        </div>

        <div style={{ ...styles.token, ...getCoords(positions.B), background: "blue" }}>
          B
        </div>
      </div>

      <button
        onClick={playTurn}
        disabled={!isMyTurn || rolling}
        style={styles.button}
      >
        {isMyTurn ? "🎲 Roll Dice" : "⏳ Wait Turn"}
      </button>

      <div style={{ marginTop: 10 }}>🎲 {dice}</div>
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
    marginBottom: 10,
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
    color: "#fff",
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