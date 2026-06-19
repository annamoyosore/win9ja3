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

const mineMap = { 1: 8, 2: 12, 3: 16, 4: 20 };

export default function MineGame() {

  const [wallet, setWallet] = useState(null);
  const [admin, setAdmin] = useState(null);

  const [difficulty, setDifficulty] = useState(1);

  // 🔥 NEW: split stake system
  const [stakeInput, setStakeInput] = useState("");
  const [activeStake, setActiveStake] = useState(null);

  const [board, setBoard] = useState([]);
  const [gameActive, setGameActive] = useState(false);

  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const [step, setStep] = useState(0);
  const [multi, setMulti] = useState(1);
  const [cashout, setCashout] = useState(0);

  const minesCount = mineMap[difficulty];

  // ================= LOAD =================
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
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

    if (userRes.documents.length) setWallet(userRes.documents[0]);
    setAdmin(adminRes);
  }

  // 🔊 POP SOUND WHEN LOCKED
  const playLockSound = () => {
    try {
      const audio = new Audio(
        "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
      );
      audio.play();
    } catch {}
  };

  // ================= CONFIRM STAKE =================
  const confirmStake = () => {
    const stake = Number(stakeInput);

    if (!stake || stake < MIN_STAKE) {
      playLockSound();
      return;
    }

    if (!wallet || wallet.balance < stake) {
      playLockSound();
      return;
    }

    setActiveStake(stake);
  };

  // ================= START GAME =================
  const startGame = async () => {
    if (!activeStake) return;

    const newBalance = wallet.balance - activeStake;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: newBalance }
    );

    setWallet((p) => ({ ...p, balance: newBalance }));

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      ADMIN_WALLET_ID,
      {
        minesProfit: (admin?.minesProfit || 0) + activeStake
      }
    );

    setBoard(createBoard(minesCount));
    setGameActive(true);
    setGameOver(false);
    setWon(false);
    setStep(0);
    setMulti(1);
    setCashout(0);
  };

  // ================= CASHOUT =================
  const cashOutNow = async () => {
    if (!gameActive || step === 0 || gameOver) return;

    const payout = cashout;

    const newUserBalance = wallet.balance + payout;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: newUserBalance }
    );

    setWallet((p) => ({ ...p, balance: newUserBalance }));

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      ADMIN_WALLET_ID,
      {
        minesReserve: (admin.minesReserve || 0) - payout
      }
    );

    setWon(true);
    setGameActive(false);
  };

  const locked = !activeStake;

  return (
    <div style={{
      textAlign: "center",
      padding: 20,
      background: "#0b0f1a",
      minHeight: "100vh",
      color: "white"
    }}>

      <h2 style={{ color: "gold" }}>💣 Mines Game</h2>

      <div style={{
        background: "#111",
        padding: 10,
        borderRadius: 10,
        marginBottom: 10
      }}>
        💰 Balance: ₦{wallet?.balance || 0}
      </div>

      {/* ================= STAKE CONTROL ================= */}
      <div style={{
        background: locked ? "#2a0000" : "#111827",
        border: locked ? "2px solid red" : "1px solid #333",
        padding: 12,
        borderRadius: 10,
        marginBottom: 10
      }}>

        <p style={{ color: locked ? "red" : "white" }}>
          {locked
            ? "🔴 PLACE STAKE TO UNLOCK GAME"
            : "✅ STAKE CONFIRMED"}
        </p>

        <input
          type="number"
          placeholder={`Min ₦${MIN_STAKE}`}
          value={stakeInput}
          onChange={(e) => setStakeInput(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid #444"
          }}
        />

        <button
          onClick={confirmStake}
          style={{
            marginLeft: 10,
            padding: "10px 15px",
            background: "red",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer"
          }}
        >
          SET STAKE
        </button>

        {activeStake && (
          <div style={{ marginTop: 10 }}>
            🎯 Active Stake: ₦{activeStake}
          </div>
        )}
      </div>

      {/* ================= DIFFICULTY ================= */}
      <div style={{ marginBottom: 10 }}>
        Difficulty:
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          style={{ marginLeft: 10, padding: 6 }}
        >
          <option value={1}>x1</option>
          <option value={2}>x2</option>
          <option value={3}>x3</option>
          <option value={4}>x4</option>
        </select>
      </div>

      {/* ================= ACTION BUTTONS ================= */}
      <button
        onClick={startGame}
        disabled={!activeStake}
        style={{
          padding: "10px 18px",
          background: activeStake ? "#22c55e" : "#555",
          color: "white",
          border: "none",
          borderRadius: 8,
          marginRight: 10,
          cursor: activeStake ? "pointer" : "not-allowed"
        }}
      >
        START GAME
      </button>

      <button
        onClick={cashOutNow}
        style={{
          padding: "10px 18px",
          background: "#f59e0b",
          color: "black",
          border: "none",
          borderRadius: 8
        }}
      >
        CASH OUT
      </button>

      {/* ================= INFO ================= */}
      <div style={{ marginTop: 10 }}>
        💣 Bombs: {mineMap[difficulty]} <br />
        📈 Multiplier: {multi.toFixed(2)}x <br />
        💰 Cashout: ₦{cashout.toFixed(2)}
      </div>

      {/* ================= STATUS ================= */}
      {gameOver && <h3 style={{ color: "red" }}>💥 BOOM!</h3>}
      {won && <h3 style={{ color: "lime" }}>🎉 WON ₦{cashout.toFixed(2)}</h3>}

      {/* ================= BOARD ALWAYS VISIBLE ================= */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${SIZE}, 55px)`,
        justifyContent: "center",
        gap: 6,
        marginTop: 20,
        opacity: activeStake ? 1 : 0.4,
        pointerEvents: activeStake ? "auto" : "none"
      }}>
        {board.map((cell, i) => (
          <div
            key={i}
            onClick={() => revealCell(i)}
            style={{
              width: 55,
              height: 55,
              borderRadius: 10,
              background: cell.revealed
                ? cell.isMine ? "#ef4444" : "#1f2937"
                : "#374151",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer"
            }}
          >
            {cell.revealed ? (cell.isMine ? "💣" : "💎") : "?"}
          </div>
        ))}
      </div>

    </div>
  );
}