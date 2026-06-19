import React, { useState, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query
} from "../lib/appwrite";

const ADMIN_WALLET_ID = "69f2482600125d496354";
const MIN_STAKE = 100;
const SIZE = 5;

/* =========================
   SOUND + VIBRATION
========================= */

function playMineSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";

    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.setValueAtTime(90, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {
    console.log("Sound blocked:", e);
  }
}

function vibrateMine() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 300]);
    }
  } catch (e) {}
}

/* =========================
   BOARD GENERATOR
========================= */

function createBoard(minesCount) {
  const total = SIZE * SIZE;
  const mineSet = new Set();

  while (mineSet.size < minesCount) {
    mineSet.add(Math.floor(Math.random() * total));
  }

  return Array.from({ length: total }, (_, i) => ({
    isMine: mineSet.has(i),
    revealed: false
  }));
}

function calcMultiplier(step, difficulty) {
  return 1 + step * (0.25 * difficulty);
}

const mineMap = { 1: 8, 2: 12, 3: 16, 4: 20 };

/* =========================
   MAIN COMPONENT
========================= */

export default function MineGame() {

  const [wallet, setWallet] = useState(null);
  const [admin, setAdmin] = useState(null);

  const [difficulty, setDifficulty] = useState(1);
  const [stakeInput, setStakeInput] = useState("");
  const [activeStake, setActiveStake] = useState(null);

  const [board, setBoard] = useState([]);

  const [gameActive, setGameActive] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const [step, setStep] = useState(0);
  const [multi, setMulti] = useState(1);
  const [cashout, setCashout] = useState(0);

  const [loadingStart, setLoadingStart] = useState(false);

  const minesCount = mineMap[difficulty];

  /* =========================
     LOAD WALLET
  ========================= */

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const u = await account.get();

      const userRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );

      const adminRes = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID
      );

      if (userRes.documents.length) {
        setWallet(userRes.documents[0]);
      }

      setAdmin(adminRes);

    } catch (e) {
      console.error("LOAD ERROR:", e);
    }
  }

  /* =========================
     STAKE
  ========================= */

  const confirmStake = () => {
    const stake = Number(stakeInput);

    if (!wallet) return;
    if (!stake || stake < MIN_STAKE) return;
    if (wallet.balance < stake) return;

    setActiveStake(stake);
  };

  /* =========================
     START GAME
  ========================= */

  const startGame = async () => {
    if (loadingStart || gameActive) return;
    if (!activeStake || !wallet || !admin) return;

    setLoadingStart(true);

    try {
      const newBalance = wallet.balance - activeStake;

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      setWallet(p => ({ ...p, balance: newBalance }));

      setBoard(createBoard(minesCount));
      setGameActive(true);
      setGameOver(false);
      setWon(false);
      setStep(0);
      setMulti(1);
      setCashout(0);

    } catch (e) {
      console.error(e);
    }

    setLoadingStart(false);
  };

  /* =========================
     REVEAL ALL (GAME OVER)
  ========================= */

  const revealAll = (data) => {
    return data.map(cell => ({
      ...cell,
      revealed: true
    }));
  };

  /* =========================
     CELL CLICK
  ========================= */

  const revealCell = (i) => {
    if (!gameActive || gameOver) return;

    const newBoard = [...board];
    const cell = newBoard[i];

    if (cell.revealed) return;

    cell.revealed = true;

    // 💥 MINE HIT
    if (cell.isMine) {
      playMineSound();
      vibrateMine();

      const full = revealAll(newBoard);

      setBoard(full);
      setGameOver(true);
      setGameActive(false);

      return;
    }

    const newStep = step + 1;
    const newMulti = calcMultiplier(newStep, difficulty);

    setStep(newStep);
    setMulti(newMulti);

    setCashout(activeStake * newMulti);
    setBoard(newBoard);
  };

  /* =========================
     CASHOUT
  ========================= */

  const cashOutNow = async () => {
    if (!gameActive || gameOver || step === 0) return;

    const payout = cashout;

    if ((admin.minesReserve || 0) < payout) return;

    const newBalance = wallet.balance + payout;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: newBalance }
    );

    setWallet(p => ({ ...p, balance: newBalance }));

    setWon(true);
    setGameActive(false);
  };

  /* =========================
     UI
  ========================= */

  return (
    <div style={{
      textAlign: "center",
      padding: 20,
      background: "#0b0f1a",
      minHeight: "100vh",
      color: "white"
    }}>

      <h2>💣 Mines Game</h2>

      <div>💰 Balance: ₦{wallet?.balance || 0}</div>

      <input
        type="number"
        value={stakeInput}
        onChange={(e) => setStakeInput(e.target.value)}
        placeholder="Enter stake"
      />

      <button onClick={confirmStake}>SET STAKE</button>

      <button onClick={startGame} disabled={!activeStake}>
        START
      </button>

      {gameOver && (
        <h3 style={{ color: "red" }}>
          💥 BOOM! Mine hit — board revealed
        </h3>
      )}

      {/* BOARD */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${SIZE}, 55px)`,
        justifyContent: "center",
        gap: 6,
        marginTop: 20
      }}>
        {board.map((cell, i) => (
          <div
            key={i}
            onClick={() => revealCell(i)}
            style={{
              width: 55,
              height: 55,
              background: cell.revealed
                ? cell.isMine ? "red" : "#222"
                : "#444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 18
            }}
          >
            {cell.revealed ? (cell.isMine ? "💣" : "💎") : "?"}
          </div>
        ))}
      </div>
    </div>
  );
}