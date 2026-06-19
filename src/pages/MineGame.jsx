import React, { useState, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query
} from "../lib/appwrite";

const ADMIN_WALLET_ID = "69f2482600125d496354";

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
  const [stake, setStake] = useState("");

  const [board, setBoard] = useState([]);
  const [gameActive, setGameActive] = useState(false);

  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const [step, setStep] = useState(0);
  const [multi, setMulti] = useState(1);
  const [cashout, setCashout] = useState(0);

  const minesCount = mineMap[difficulty];

  // ================= LOAD WALLET =================
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

  // ================= START GAME =================
  const startGame = async () => {
    if (!wallet || !stake || stake <= 0) return;
    if (wallet.balance < stake) return;

    const newUserBalance = wallet.balance - stake;

    // 💸 1. DEDUCT USER STAKE
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: newUserBalance
      }
    );

    setWallet((p) => ({ ...p, balance: newUserBalance }));

    // 💰 2. ADD TO ADMIN PROFIT
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      ADMIN_WALLET_ID,
      {
        minesProfit: (admin?.minesProfit || 0) + stake
      }
    );

    setAdmin((p) => ({
      ...p,
      minesProfit: (p?.minesProfit || 0) + stake
    }));

    // start board
    setBoard(createBoard(minesCount));
    setGameActive(true);
    setGameOver(false);
    setWon(false);
    setStep(0);
    setMulti(1);
    setCashout(0);
  };

  // ================= REVEAL =================
  const revealCell = (index) => {
    if (!gameActive || gameOver || won) return;

    setBoard((prev) => {
      const newBoard = [...prev];
      const cell = newBoard[index];

      if (cell.revealed) return prev;

      cell.revealed = true;

      if (cell.isMine) {
        setGameOver(true);
        newBoard.forEach(c => (c.revealed = true));
        setCashout(0);
        return newBoard;
      }

      setStep((s) => {
        const newStep = s + 1;
        const m = calcMultiplier(newStep, difficulty);

        setMulti(m);
        setCashout(stake * m);

        return newStep;
      });

      return newBoard;
    });
  };

  // ================= CASHOUT =================
  const cashOutNow = async () => {
    if (!gameActive || step === 0 || gameOver) return;

    const payout = cashout;

    if (!admin || (admin.minesReserve || 0) < payout) {
      alert("Insufficient casino reserve");
      return;
    }

    // 💸 1. PAY USER
    const newUserBalance = wallet.balance + payout;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: newUserBalance
      }
    );

    setWallet((p) => ({ ...p, balance: newUserBalance }));

    // 💸 2. DEDUCT FROM ADMIN RESERVE
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      ADMIN_WALLET_ID,
      {
        minesReserve: (admin.minesReserve || 0) - payout
      }
    );

    setAdmin((p) => ({
      ...p,
      minesReserve: (p.minesReserve || 0) - payout
    }));

    setWon(true);
    setGameActive(false);
  };

  return (
    <div style={{ textAlign: "center", padding: 20 }}>

      <h2>💣 Mines Game</h2>

      <h3>Balance: ₦{wallet?.balance || 0}</h3>

      <div>
        Difficulty:
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
        >
          <option value={1}>x1</option>
          <option value={2}>x2</option>
          <option value={3}>x3</option>
          <option value={4}>x4</option>
        </select>
      </div>

      <input
        type="number"
        value={stake}
        onChange={(e) => setStake(Number(e.target.value))}
        placeholder="Enter stake"
      />

      <button onClick={startGame}>
        Start Game
      </button>

      <button onClick={cashOutNow}>
        Cash Out
      </button>

      <div>
        Multiplier: {multi.toFixed(2)}x <br />
        Cashout: ₦{cashout.toFixed(2)}
      </div>

      {gameOver && <h3 style={{ color: "red" }}>💥 You Lost</h3>}
      {won && <h3 style={{ color: "lime" }}>🎉 You Won ₦{cashout.toFixed(2)}</h3>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${SIZE}, 55px)`,
          justifyContent: "center",
          gap: 6,
          marginTop: 20
        }}
      >
        {board.map((cell, i) => (
          <div
            key={i}
            onClick={() => revealCell(i)}
            style={{
              width: 55,
              height: 55,
              background: cell.revealed
                ? cell.isMine
                  ? "#ff2b2b"
                  : "#2d2d2d"
                : "#555",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
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