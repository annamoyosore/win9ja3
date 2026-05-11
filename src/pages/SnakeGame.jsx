import { useEffect, useState, useRef } from "react";
import { databases, DATABASE_ID } from "../lib/appwrite";
import boardImg from "./board.png";

const GAME_COLLECTION = "snakegame";
const MATCH_COLLECTION = "snakelobby";
const WALLET_COLLECTION = "wallets";

const SIZE = 100;

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

  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

// =========================
// MAIN
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [turn, setTurn] = useState("A");

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  const [winnerPopup, setWinnerPopup] = useState(null);

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
  // VALIDATE TURN (BACKEND CHECK)
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
      await sleep(120);
      pos += 1;
      if (pos > SIZE) pos = SIZE;

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
  // PLAY TURN (HARDENED)
  // =========================
  async function playTurn() {
    const player = turn;

    if (!game || rolling || moving) return;
    if (lock.current) return;

    lock.current = true;
    setRolling(true);
    setMoving(true);

    try {
      // 🔒 SERVER TURN CHECK
      const allowed = await validateTurn(player);

      if (!allowed) {
        alert("❌ Not your turn");
        return;
      }

      // 🎲 animation
      for (let i = 0; i < 8; i++) {
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
      // WIN HANDLER
      // =========================
      if (winner) {
        const pot = match?.pot || 0;

        setWinnerPopup({
          player: winner,
          amount: pot,
        });

        setTimeout(() => setWinnerPopup(null), 5000);

        await payoutOnce(winner, pot);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      setMoving(false);

      setTimeout(() => {
        lock.current = false;
      }, 600);
    }
  }

  // =========================
  // PAYOUT (ONCE ONLY)
  // =========================
  async function payoutOnce(winner, pot) {
    if (payoutLock.current) return;
    payoutLock.current = true;

    if (!match?.$id || pot <= 0) return;

    const wallet = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      []
    );

    const w = wallet.documents.find(
      (x) => x.userId === winner
    );

    if (!w) return;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      w.$id,
      {
        balance: Number(w.balance || 0) + pot,
      }
    );

    await databases.updateDocument(
      DATABASE_ID,
      MATCH_COLLECTION,
      match.$id,
      {
        pot: 0,
        payoutDone: true,
        status: "finished",
      }
    );
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

      {winnerPopup && (
        <div style={styles.popup}>
          🏆 Player {winnerPopup.player} Won ₦{winnerPopup.amount}
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
    color: "#fff",
    fontWeight: "bold",
  },

  popup: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "gold",
    color: "#000",
    padding: 20,
    fontWeight: "bold",
    borderRadius: 10,
  },

  history: {
    marginTop: 10,
    fontSize: 12,
  },
};