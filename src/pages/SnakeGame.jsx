import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  Query,
} from "../lib/appwrite";

import boardImg from "./board.png";

const GAME_COLLECTION = "snakegame";
const LOBBY_COLLECTION = "snakelobby";
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

function trimHistory(h = []) {
  return h.slice(0, 3);
}

// =========================
// PAYOUT FUNCTION
// =========================
async function payoutWinner(userId, amount) {
  try {
    if (!userId || !amount) return;

    const wallet = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId), Query.limit(1)]
    );

    if (!wallet.documents.length) return;

    const w = wallet.documents[0];

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      w.$id,
      {
        balance: Number(w.balance || 0) + Number(amount),
      }
    );
  } catch (err) {
    console.error("PAYOUT ERROR:", err);
  }
}

// =========================
// MAIN COMPONENT
// =========================
export default function SnakeGame({ gameId }) {
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({
    host: 1,
    opponent: 1,
  });

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    async function load() {
      const u = await account.get();
      setUser(u);

      const res = await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId
      );

      setGame(res);
      setPositions(JSON.parse(res.positions || '{"host":1,"opponent":1}'));
    }

    load();
  }, [gameId]);

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      (res) => {
        const g = res.payload;
        setGame(g);
        setPositions(JSON.parse(g.positions || '{"host":1,"opponent":1}'));
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // PLAYER ROLE
  // =========================
  const myKey =
    game?.hostId === user?.$id ? "host" : "opponent";

  const isMyTurn = game?.turn === user?.$id;

  // =========================
  // MOVE ANIMATION
  // =========================
  async function animate(key, start, end) {
    let pos = start;

    while (pos < end) {
      await sleep(120);
      pos++;

      setPositions((p) => ({
        ...p,
        [key]: pos,
      }));
    }

    const final = applyEffects(pos);

    setPositions((p) => ({
      ...p,
      [key]: final,
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

      if (fresh.turn !== user.$id) return;

      const roll = rollDice();
      setDice(roll);

      const current = JSON.parse(fresh.positions);

      const start = current[myKey];
      let target = start + roll;

      if (target > SIZE) target = SIZE;

      const final = await animate(myKey, start, target);

      const winner = final >= SIZE ? user.$id : null;

      const nextTurn =
        fresh.turn === fresh.hostId
          ? fresh.opponentId
          : fresh.hostId;

      const history = trimHistory([
        `Roll ${roll} → ${final}`,
        ...(fresh.history || []),
      ]);

      // =========================
      // UPDATE GAME
      // =========================
      const updated = await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...current,
            [myKey]: final,
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

        const winnerId =
          winner === fresh.hostId
            ? fresh.hostId
            : fresh.opponentId;

        await payoutWinner(winnerId, pot);

        // finish lobby
        if (fresh.lobbyId) {
          await databases.updateDocument(
            DATABASE_ID,
            LOBBY_COLLECTION,
            fresh.lobbyId,
            {
              status: "finished",
            }
          );
        }

        alert(`🏆 Winner got ₦${pot}`);

        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRolling(false);
      setTimeout(() => (lock.current = false), 400);
    }
  }

  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🐍 Snake Game</h2>

      <div style={styles.turnBox}>
        Turn: {game?.turn === user?.$id ? "🟢 Your Turn" : "⚪ Opponent Turn"}
      </div>

      <div style={styles.boardWrapper}>
        <img src={boardImg} style={styles.board} />

        <div style={{ ...styles.token, ...getCoords(positions.host), background: "red" }}>H</div>
        <div style={{ ...styles.token, ...getCoords(positions.opponent), background: "blue" }}>O</div>
      </div>

      <button
        onClick={playTurn}
        disabled={!isMyTurn || rolling}
        style={styles.button}
      >
        {rolling ? "Rolling..." : "🎲 Roll Dice"}
      </button>

      <div>🎲 {dice}</div>
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

  turnBox: {
    margin: "10px auto",
    padding: 10,
    background: "#111827",
    width: 200,
    borderRadius: 10,
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
    color: "#fff",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  button: {
    padding: "12px 18px",
    background: "gold",
    border: "none",
    borderRadius: 10,
    fontWeight: "bold",
  },
};