import React, { useState, useEffect } from "react";
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

export default function MineGame() {

  const [wallet, setWallet] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);

  // 🎬 INTRO COUNTDOWN STATE
  const [countdown, setCountdown] = useState(5);
  const [inIntro, setInIntro] = useState(true);

  const [difficulty] = useState(1);
  const minesCount = mineMap[difficulty];

  const [stake, setStake] = useState("");
  const [board, setBoard] = useState([]);

  const [gameStarted, setGameStarted] = useState(false);

  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const [step, setStep] = useState(0);
  const [multi, setMulti] = useState(1);
  const [cashout, setCashout] = useState(0);

  // ================= LOAD WALLET =================
  useEffect(() => {
    loadWallet();
  }, []);

  async function loadWallet() {
    try {
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

    } catch (err) {
      console.error(err);
    }
  }

  // ================= COUNTDOWN START =================
  useEffect(() => {
    if (!wallet) return;

    if (inIntro) {
      if (countdown <= 0) {
        startGame();
        return;
      }

      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [countdown, inIntro, wallet]);

  // ================= AUTO START GAME =================
  const startGame = async () => {
    try {
      let gameId = activeGameId || wallet.activeGameId;

      if (!gameId) {
        gameId = ID.unique();

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          wallet.$id,
          {
            activeGameId: gameId
          }
        );
      }

      setActiveGameId(gameId);

      setBoard(createBoard(minesCount));
      resetStates();

      setGameStarted(true);
      setInIntro(false);

    } catch (err) {
      console.error("Start error:", err);
    }
  };

  const resetStates = () => {
    setGameOver(false);
    setWon(false);
    setStep(0);
    setMulti(1);
    setCashout(0);
  };

  // ================= LOADING =================
  if (!wallet) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: 100 }}>
        Loading wallet...
      </div>
    );
  }

  // ================= INTRO SCREEN =================
  if (inIntro) {
    return (
      <div style={{
        height: "100vh",
        background: "#000",
        color: "white",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontSize: 30,
        fontWeight: "bold"
      }}>
        💣 Mines Game

        <div style={{
          marginTop: 20,
          fontSize: 60,
          color: "gold"
        }}>
          {countdown}
        </div>

        <p style={{ fontSize: 14, opacity: 0.7 }}>
          Entering game room...
        </p>
      </div>
    );
  }

  // ================= GAME BOARD =================
  return (
    <div style={{ textAlign: "center", padding: 20 }}>

      {/* 💰 WALLET DISPLAY */}
      <div style={{
        background: "#111",
        color: "gold",
        padding: 10,
        borderRadius: 10,
        marginBottom: 10,
        fontWeight: "bold"
      }}>
        💰 Balance: ₦{wallet?.balance || 0}
      </div>

      <h2>💣 Mines Game</h2>

      <input
        type="number"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Enter stake"
      />

      <div style={{ margin: "10px 0" }}>
        Multiplier: {multi.toFixed(2)}x <br />
        Cashout: ₦{cashout.toFixed(2)}
      </div>

      {/* BOARD */}
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
            background: c.revealed ? (c.isMine ? "red" : "#333") : "#666",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            {c.revealed ? (c.isMine ? "💣" : "💎") : "?"}
          </div>
        ))}
      </div>

    </div>
  );
}