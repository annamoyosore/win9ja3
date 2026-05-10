import { useEffect, useState, useRef } from "react";
import {
  databases,
  DATABASE_ID,
  Query,
  account
} from "../lib/appwrite";

import boardImg from "./board.png";

const GAME = "snakegame";
const MATCH = "snakelobby";
const WALLETS = "wallets";

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
  57: 96,
  52: 72,
  71: 92,
};

// =========================
// HELPERS
// =========================
function getCoords(pos) {
  const i = pos - 1;
  const row = Math.floor(i / 10);
  let col = i % 10;

  if (row % 2 === 1) col = 9 - col;

  return {
    left: `${col * 10 + 5}%`,
    top: `${(9 - row) * 10 + 5}%`,
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// keep last 6 moves
function pushMove(arr, value) {
  return [...(arr || []), value].slice(-6);
}

// =========================
// GAME
// =========================
export default function SnakeGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [me, setMe] = useState(null);

  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  const [winnerPopup, setWinnerPopup] = useState(null);

  const payoutLock = useRef(false);
  const actionLock = useRef(false);

  // =========================
  // GET USER
  // =========================
  useEffect(() => {
    account.get().then(u => setMe(u.$id));
  }, []);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId || !me) return;

    const load = async () => {
      const g = await databases.getDocument(
        DATABASE_ID,
        GAME,
        gameId
      );

      setGame(g);

      if (g.matchId) {
        const m = await databases.getDocument(
          DATABASE_ID,
          MATCH,
          g.matchId
        );
        setMatch(m);
      }
    };

    load();

    const sub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME}.documents.${gameId}`,
      (res) => {
        setGame(res.payload);
      }
    );

    return () => sub();
  }, [gameId, me]);

  // =========================
  // TURN CHECK (IMPORTANT FIX)
  // =========================
  function isMyTurn() {
    return game?.turn === me;
  }

  function myIndex() {
    return game?.players?.indexOf(me);
  }

  function oppIndex() {
    return myIndex() === 0 ? 1 : 0;
  }

  // =========================
  // APPLY SNAKE / LADDER
  // =========================
  function apply(pos) {
    if (snakes[pos]) return snakes[pos];
    if (ladders[pos]) return ladders[pos];
    return pos;
  }

  // =========================
  // MOVE ANIMATION
  // =========================
  async function move(player, steps, positions) {
    let current = positions[player];

    for (let i = 0; i < steps; i++) {
      await sleep(120);
      current++;
      if (current > SIZE) current = SIZE;
    }

    return apply(current);
  }

  // =========================
  // DICE ROLL
  // =========================
  async function play() {

    if (!game || moving || rolling) return;

    // 🚫 TURN LOCK (IMPORTANT FIX)
    if (!isMyTurn()) {
      alert("❌ Not your turn");
      return;
    }

    actionLock.current = true;

    setRolling(true);
    setDice(rollDice());
    await sleep(600);
    setRolling(false);

    const d = rollDice();
    setDice(d);

    const player = game.turn;
    const positions = game.positions || { A: 1, B: 1 };

    setMoving(true);

    const newPos = await move(player, d, positions);

    const updated = {
      ...positions,
      [player]: newPos,
    };

    const history = pushMove(game.history, `${player} → ${d} → ${newPos}`);

    let winner = "";

    if (newPos >= SIZE) {
      winner = player;
    }

    const updatedGame = {
      ...game,
      positions: updated,
      turn: player === "A" ? "B" : "A",
      history,
      winner,
      status: winner ? "finished" : "playing"
    };

    await databases.updateDocument(
      DATABASE_ID,
      GAME,
      gameId,
      updatedGame
    );

    setGame(updatedGame);

    setMoving(false);
    actionLock.current = false;

    // 🏆 WIN POPUP
    if (winner) {
      setWinnerPopup({
        player: winner,
        pot: match?.pot || 0
      });
    }
  }

  // =========================
  // PAYOUT (FIXED)
  // =========================
  useEffect(() => {
    async function payout() {

      if (!game || !match) return;

      if (game.status !== "finished") return;

      if (!game.winner) return;

      if (payoutLock.current) return;

      payoutLock.current = true;

      const pot = Number(match.pot || 0);

      const winnerUserId =
        game.players[game.winner === "A" ? 0 : 1];

      const wallet = await databases.listDocuments(
        DATABASE_ID,
        WALLETS,
        [Query.equal("userId", winnerUserId)]
      );

      if (wallet.documents.length) {

        const w = wallet.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLETS,
          w.$id,
          {
            balance: Number(w.balance || 0) + pot
          }
        );
      }

      // 🧹 CLEAR POT + FINISH MATCH
      await databases.updateDocument(
        DATABASE_ID,
        MATCH,
        match.$id,
        {
          pot: 0,
          status: "finished"
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        GAME,
        gameId,
        {
          payoutDone: true
        }
      );

      setTimeout(() => goHome?.(), 5000);
    }

    payout();

  }, [game, match]);

  // =========================
  // UI
  // =========================
  if (!game) return <div>Loading...</div>;

  const pos = game.positions || { A: 1, B: 1 };

  return (
    <div style={styles.container}>

      <h2>🐍 Snake Game</h2>

      {/* TURN */}
      <h3>
        Turn: {game.turn === me ? "🟢 YOU" : "⏳ OPPONENT"}
      </h3>

      {/* POT */}
      <div>💰 Pot: ₦{match?.pot || 0}</div>

      {/* DICE */}
      <div style={styles.dice}>🎲 {dice}</div>

      {/* BOARD */}
      <div style={styles.board}>
        <img src={boardImg} style={{ width: "100%" }} />

        {["A", "B"].map(p => (
          <div
            key={p}
            style={{
              ...styles.token,
              ...getCoords(pos[p]),
              background: p === "A" ? "red" : "blue"
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* BUTTON */}
      <button
        onClick={play}
        disabled={!isMyTurn() || moving}
      >
        🎲 Roll Dice
      </button>

      {/* HISTORY */}
      <div>
        {game.history?.slice(-6).map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>

      {/* WIN POPUP */}
      {winnerPopup && (
        <div style={styles.win}>
          🏆 {winnerPopup.player} WON!
          <br />
          ₦{winnerPopup.pot}
        </div>
      )}

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
    color: "white",
    minHeight: "100vh",
    padding: 20,
  },

  board: {
    position: "relative",
    width: 350,
    margin: "auto"
  },

  token: {
    position: "absolute",
    width: 25,
    height: 25,
    borderRadius: "50%",
    color: "#fff",
    fontWeight: "bold",
    transform: "translate(-50%, -50%)"
  },

  dice: {
    fontSize: 40
  },

  win: {
    position: "fixed",
    top: "40%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "gold",
    color: "#000",
    padding: 20,
    fontWeight: "bold"
  }
};