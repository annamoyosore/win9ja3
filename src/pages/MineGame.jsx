import React, { useState, useEffect, useRef } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

// ================= ORIGINAL LOGIC (UNCHANGED) =================
const SIZE = 5;

function createBoard(minesCount) {
  const total = SIZE * SIZE;
  const mineSet = new Set();

  while (mineSet.size < minesCount) {
    mineSet.add(Math.floor(Math.random() * total));
  }

  return Array.from({ length: total }, (_, i) => ({
    isMine: mineSet.has(i),
    revealed: false,
  }));
}

function calcMultiplier(step, difficulty) {
  return 1 + step * (0.25 * difficulty);
}
// ===============================================================

const mineMap = { 1: 8, 2: 12, 3: 16, 4: 20 };

const ADMIN_WALLET_ID = "69f2482600125d496354";

export default function MineGame() {

  // wallet + game
  const [wallet, setWallet] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);

  // UI states
  const [showIntro, setShowIntro] = useState(true);

  // game states
  const [difficulty, setDifficulty] = useState(1);
  const [stake, setStake] = useState("");
  const [board, setBoard] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);

  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const [step, setStep] = useState(0);
  const [multi, setMulti] = useState(1);
  const [cashout, setCashout] = useState(0);

  const minesCount = mineMap[difficulty];

  // ================= LOAD WALLET =================
  useEffect(() => {
    loadWallet();
  }, []);

  async function loadWallet() {
    const u = await account.get();

    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (!res.documents.length) return;

    const w = res.documents[0];

    setWallet(w);
    setActiveGameId(w.activeGameId || null);

    // 🔐 AUTO RESUME OR SHOW INTRO
    if (w.activeGameId) {
      resumeGame(w.activeGameId);
      setShowIntro(false);
    } else {
      setShowIntro(true);
    }
  }

  // ================= INTRO → START GAME =================
  const startNewGame = async () => {
    const gameId = ID.unique();

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        activeGameId: gameId
      }
    );

    setActiveGameId(gameId);

    setBoard(createBoard(minesCount));
    setGameStarted(true);
    setShowIntro(false);
    resetStates();
  };

  const resumeGame = async (gameId) => {
    // In real production: fetch game from DB
    setBoard(createBoard(minesCount)); // fallback placeholder
    setGameStarted(true);
    resetStates();
  };

  const resetStates = () => {
    setGameOver(false);
    setWon(false);
    setStep(0);
    setMulti(1);
    setCashout(0);
  };

  // ================= INTRO SCREEN =================
  if (showIntro) {
    return (
      <div style={{
        height: "100vh",
        background: "black",
        color: "white",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center"
      }}>
        <canvas id="mineCanvas" style={{ position: "absolute", width: "100%", height: "100%" }} />

        <h1>💣 Mines Game</h1>

        <p>✔ Pick safe tiles</p>
        <p>✔ Avoid bombs</p>
        <p>✔ Cash out anytime</p>
        <p>✔ Higher risk = higher reward</p>

        <button
          onClick={startNewGame}
          style={{
            padding: "12px 25px",
            marginTop: 20,
            background: "gold",
            border: "none",
            cursor: "pointer"
          }}
        >
          START GAME
        </button>
      </div>
    );
  }

  // ================= GAME UI =================
  return (
    <div style={{ textAlign: "center", padding: 20 }}>

      <h2>💣 Mines Game</h2>

      <h3>Balance: ₦{wallet?.balance || 0}</h3>

      <input
        type="number"
        value={stake}
        disabled={gameStarted}
        onChange={(e) => setStake(e.target.value)}
      />

      <div>
        Multiplier: {multi.toFixed(2)}x <br />
        Cashout: ₦{cashout.toFixed(2)}
      </div>

      {/* BOARD (your existing logic stays here) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${SIZE}, 50px)`,
        justifyContent: "center",
        gap: 5
      }}>
        {board.map((c, i) => (
          <div key={i} style={{
            width: 50,
            height: 50,
            background: c.revealed ? (c.isMine ? "red" : "#333") : "#666"
          }}>
            {c.revealed ? (c.isMine ? "💣" : "💎") : "?"}
          </div>
        ))}
      </div>

    </div>
  );
}