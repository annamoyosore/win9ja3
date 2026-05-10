import { useEffect, useState } from "react";
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
  57: 96,
  52: 72,
  71: 92,
};

// =========================
// HELPERS
// =========================
function getCoords(pos = 1) {
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

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeParse(data, fallback) {
  if (!data) return fallback;

  if (typeof data === "object") return data;

  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

// =========================
// MAIN GAME
// =========================
export default function SnakeGame({ gameId }) {
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({
    A: 1,
    B: 1
  });

  const [dice, setDice] = useState(1);

  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);

  const [rollAnim, setRollAnim] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId) return;

    async function init() {
      try {
        const user = await account.get();
        setCurrentUser(user);

        const gameDoc = await databases.getDocument(
          DATABASE_ID,
          SNAKE_GAME_COLLECTION,
          gameId
        );

        setGame(gameDoc);

        const parsedPositions = safeParse(
          gameDoc.positions,
          { A: 1, B: 1 }
        );

        setPositions(parsedPositions);

      } catch (err) {
        console.log(err);
      }
    }

    init();

  }, [gameId]);

  // =========================
  // REALTIME UPDATE
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsubscribe = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${SNAKE_GAME_COLLECTION}.documents.${gameId}`,
      (response) => {
        const updated = response.payload;

        setGame(updated);

        const parsedPositions = safeParse(
          updated.positions,
          { A: 1, B: 1 }
        );

        setPositions(parsedPositions);
      }
    );

    return () => unsubscribe();

  }, [gameId]);

  // =========================
  // APPLY SNAKES/LADDERS
  // =========================
  function applyEffects(pos) {
    if (snakes[pos]) {
      return snakes[pos];
    }

    if (ladders[pos]) {
      return ladders[pos];
    }

    return pos;
  }

  // =========================
  // NEXT TURN
  // =========================
  function nextTurn(turn) {
    return turn === "A" ? "B" : "A";
  }

  // =========================
  // FIND CURRENT PLAYER
  // =========================
  function getPlayerLetter() {
    const players = safeParse(game?.players, []);

    if (!currentUser || !players.length) {
      return null;
    }

    return players[0] === currentUser.$id
      ? "A"
      : "B";
  }

  // =========================
  // ANIMATE TILE MOVEMENT
  // =========================
  async function animateMovement(
    player,
    from,
    to
  ) {
    let current = from;

    while (current < to) {
      current++;

      setPositions((prev) => ({
        ...prev,
        [player]: current
      }));

      await sleep(250);
    }

    return current;
  }

  // =========================
  // DICE ANIMATION
  // =========================
  async function animateDice() {
    setRolling(true);
    setRollAnim(true);

    for (let i = 0; i < 12; i++) {
      setDice(
        Math.floor(Math.random() * 6) + 1
      );

      await sleep(90);
    }

    setRollAnim(false);
  }

  // =========================
  // PAYOUT
  // =========================
  async function handlePayout(updatedGame) {
    try {
      if (updatedGame.payoutDone) {
        return;
      }

      const winner = updatedGame.winner;

      if (!winner) return;

      const players = safeParse(
        updatedGame.players,
        []
      );

      const winnerId =
        winner === "A"
          ? players[0]
          : players[1];

      const walletRes =
        await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal(
              "userId",
              winnerId
            ),
            Query.limit(1)
          ]
        );

      if (!walletRes.documents.length) {
        return;
      }

      const wallet =
        walletRes.documents[0];

      // =========================
      // SEND POT TO WINNER
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance:
            Number(wallet.balance) +
            Number(updatedGame.pot)
        }
      );

      // =========================
      // EMPTY POT + LOCK PAYOUT
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        updatedGame.$id,
        {
          payoutDone: true,
          pot: 0
        }
      );

      // =========================
      // CLOSE LOBBY
      // =========================
      if (updatedGame.lobbyId) {
        await databases.updateDocument(
          DATABASE_ID,
          SNAKE_LOBBY_COLLECTION,
          updatedGame.lobbyId,
          {
            status: "finished"
          }
        );
      }

    } catch (err) {
      console.log(
        "Payout Error:",
        err
      );
    }
  }

  // =========================
  // PLAY TURN
  // =========================
  async function playTurn() {
    try {
      if (!game) return;

      if (moving || rolling) return;

      if (game.status === "finished") {
        return;
      }

      const myLetter =
        getPlayerLetter();

      if (!myLetter) return;

      // ✅ ONLY CURRENT PLAYER
      if (game.turn !== myLetter) {
        alert("Not your turn");
        return;
      }

      setMoving(true);

      // 🎲 ANIMATION
      await animateDice();

      const rolled = rollDice();

      setDice(rolled);

      setRolling(false);

      const currentPos =
        positions[myLetter] || 1;

      let target =
        currentPos + rolled;

      if (target > SIZE) {
        target = SIZE;
      }

      // 🎯 STEP MOVEMENT
      await animateMovement(
        myLetter,
        currentPos,
        target
      );

      // 🐍 APPLY EFFECTS
      const finalPos =
        applyEffects(target);

      // 🎯 SHOW JUMP
      if (finalPos !== target) {
        await sleep(500);

        setPositions((prev) => ({
          ...prev,
          [myLetter]: finalPos
        }));
      }

      const updatedPositions = {
        ...positions,
        [myLetter]: finalPos
      };

      const history =
        safeParse(game.history, []);

      const updatedHistory = [
        {
          player: myLetter,
          dice: rolled,
          from: currentPos,
          to: finalPos,
          time: Date.now()
        },
        ...history
      ].slice(0, 10);

      let winner = "";

      if (finalPos >= SIZE) {
        winner = myLetter;
      }

      const updatedGame = {
        positions:
          JSON.stringify(
            updatedPositions
          ),

        history:
          JSON.stringify(
            updatedHistory
          ),

        turn: winner
          ? game.turn
          : nextTurn(myLetter),

        winner,

        status: winner
          ? "finished"
          : "playing"
      };

      // =========================
      // SAVE GAME
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        gameId,
        updatedGame
      );

      // =========================
      // PAY WINNER
      // =========================
      if (winner) {
        await handlePayout({
          ...game,
          ...updatedGame,
          $id: gameId,
          pot: game.pot
        });
      }

      setMoving(false);

    } catch (err) {
      console.log(err);
      setMoving(false);
      setRolling(false);
    }
  }

  // =========================
  // LOADING
  // =========================
  if (!game) {
    return (
      <div style={styles.loading}>
        Loading Snake Game...
      </div>
    );
  }

  const myLetter =
    getPlayerLetter();

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>

      <h2>
        🐍 Snake & Ladder
      </h2>

      {/* TURN */}
      <div
        style={{
          ...styles.turnBox,
          background:
            game.turn === "A"
              ? "#16a34a"
              : "#2563eb"
        }}
      >
        {game.status === "finished" ? (
          <b>
            🏆 Winner:
            {" "}
            Player {game.winner}
          </b>
        ) : (
          <b>
            🎯 Turn:
            {" "}
            Player {game.turn}
          </b>
        )}
      </div>

      {/* DICE */}
      <div style={styles.diceBox}>
        <div
          style={{
            ...styles.dice,
            transform: rollAnim
              ? "rotate(360deg)"
              : "rotate(0deg)"
          }}
        >
          🎲 {dice}
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
                  ? "#16a34a"
                  : "#2563eb",

              transform:
                game.turn === p
                  ? "translate(-50%, -50%) scale(1.3)"
                  : "translate(-50%, -50%)",

              opacity:
                game.turn === p
                  ? 1
                  : 0.7
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* PLAYER INFO */}
      <div style={styles.info}>
        You are:
        {" "}
        <b>
          Player {myLetter}
        </b>
      </div>

      {/* BUTTON */}
      <button
        onClick={playTurn}
        disabled={
          moving ||
          rolling ||
          game.status === "finished" ||
          game.turn !== myLetter
        }
        style={{
          ...styles.button,
          opacity:
            moving ||
            rolling ||
            game.turn !== myLetter
              ? 0.5
              : 1
        }}
      >
        {rolling
          ? "Rolling..."
          : game.turn !== myLetter
          ? "Waiting..."
          : "🎲 Roll Dice"}
      </button>

      {/* HISTORY */}
      <div style={styles.history}>
        <h4>
          Recent Moves
        </h4>

        {safeParse(
          game.history,
          []
        ).map((h, i) => (
          <div key={i}>
            Player {h.player}
            {" "}
            🎲{h.dice}
            :
            {" "}
            {h.from}
            {" → "}
            {h.to}
          </div>
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
    color: "white",
    minHeight: "100vh",
    padding: 20
  },

  loading: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a",
    color: "white"
  },

  turnBox: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
    fontSize: 18,
    color: "white",
    fontWeight: "bold"
  },

  diceBox: {
    marginBottom: 15
  },

  dice: {
    fontSize: 45,
    transition: "0.4s",
    display: "inline-block"
  },

  boardWrapper: {
    position: "relative",
    width: 360,
    height: 360,
    margin: "20px auto"
  },

  board: {
    width: "100%",
    height: "100%"
  },

  token: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    fontWeight: "bold",
    border: "2px solid white",
    transition: "0.25s"
  },

  info: {
    marginTop: 10,
    fontSize: 16
  },

  button: {
    marginTop: 15,
    padding: "12px 24px",
    borderRadius: 12,
    border: "none",
    background: "gold",
    fontWeight: "bold",
    fontSize: 16,
    cursor: "pointer"
  },

  history: {
    marginTop: 20,
    background: "#111827",
    padding: 15,
    borderRadius: 12,
    maxWidth: 340,
    marginInline: "auto",
    textAlign: "left",
    fontSize: 14
  }
};