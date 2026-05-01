import { useState, useRef, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

const CASINO_COLLECTION = "casino_spins";
const TRANSACTION_COLLECTION = "transactions";

export default function CasinoWheel({ goBack }) {

  const [userId, setUserId] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [freeSpins, setFreeSpins] = useState(0);
  const [countdown, setCountdown] = useState(null);

  const audioCtxRef = useRef(null);
  const tickRef = useRef(null);

  // =========================
  // LOAD USER + WALLET
  // =========================
  useEffect(() => {
    loadWallet();
  }, []);

  async function loadWallet() {
    const u = await account.get();
    setUserId(u.$id);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (w.documents.length) {
      setWallet(w.documents[0]);
    }
  }

  // =========================
  // SOUND (SAFE VOLUME)
  // =========================
  const playSound = (type) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }

    const ctx = audioCtxRef.current;

    const tone = (f, d, vol = 0.15) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.connect(g);
      g.connect(ctx.destination);

      o.frequency.value = f;
      g.gain.value = vol;

      o.start();
      setTimeout(() => o.stop(), d);
    };

    if (type === "spin") {
      if (tickRef.current) clearInterval(tickRef.current);

      tickRef.current = setInterval(() => {
        tone(500 + Math.random() * 200, 80, 0.05);
      }, 100);
    }

    if (type === "stop") {
      clearInterval(tickRef.current);
    }

    if (type === "win") {
      [500, 800, 1200].forEach((f, i) =>
        setTimeout(() => tone(f, 200, 0.2), i * 120)
      );
    }

    if (type === "lose") {
      [400, 250].forEach((f, i) =>
        setTimeout(() => tone(f, 200, 0.15), i * 150)
      );
    }
  };

  // =========================
  // RESET GAME
  // =========================
  function resetGame() {
    setRotation(0);
    setResult("");
    setWon(0);
    setCountdown(null);
  }

  function startReset() {
    let time = 3; // 🔥 FAST RESET

    setCountdown(time);

    const interval = setInterval(() => {
      time--;
      setCountdown(time);

      if (time <= 0) {
        clearInterval(interval);
        resetGame();
      }
    }, 1000);
  }

  // =========================
  // PROBABILITY (UPDATED)
  // =========================
  const pool = [
    { type: "LOSE", weight: 0.40 },   // 2 lose slots
    { type: "X2", weight: 0.15 },
    { type: "X3", weight: 0.03 },
    { type: "FREE", weight: 0.41 },
    { type: "X10", weight: 0.01 }
  ];

  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.weight;
      if (r <= sum) return p.type;
    }
  };

  // =========================
  // SPIN LOGIC
  // =========================
  const spin = async () => {
    if (spinning) return;

    const numericStake = Number(stake);

    if (numericStake < 50 && freeSpins <= 0) {
      setResult("⚠️ Minimum ₦50");
      return;
    }

    if (!wallet) return;

    if (freeSpins <= 0 && wallet.balance < numericStake) {
      setResult("❌ Insufficient balance");
      return;
    }

    setSpinning(true);
    setResult("");
    setWon(0);

    playSound("spin");

    const outcome = getResult();

    const stopAngle = Math.random() * 360;
    setRotation((r) => r + 1440 + stopAngle);

    setTimeout(async () => {

      playSound("stop");

      let win = 0;
      let newBalance = wallet.balance;
      let status = "lost";

      // =========================
      // RESULT CALCULATION
      // =========================
      if (outcome === "LOSE") {
        if (freeSpins <= 0) newBalance -= numericStake;
        playSound("lose");
        setResult(`❌ Lost ₦${numericStake}`);

      } else if (outcome === "FREE") {
        setFreeSpins((f) => f + 1);
        playSound("win");
        setResult("🎁 Free Spin!");
        status = "free";

      } else {
        const mult = parseInt(outcome.replace("X", ""));
        win = numericStake * mult;

        if (freeSpins <= 0) newBalance -= numericStake;
        newBalance += win;

        setWon(win);
        playSound("win");
        setResult(`🎉 Won ₦${win}`);
        status = "won";
      }

      // =========================
      // UPDATE WALLET
      // =========================
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      setWallet({ ...wallet, balance: newBalance });

      // =========================
      // SAVE GAME RECORD
      // =========================
      const spinId = ID.unique();

      await databases.createDocument(
        DATABASE_ID,
        CASINO_COLLECTION,
        spinId,
        {
          userId,
          stake: numericStake,
          outcome,
          winAmount: win,
          status,
          balanceAfter: newBalance,
          createdAt: new Date().toISOString()
        }
      );

      // =========================
      // SAVE TRANSACTION
      // =========================
      await databases.createDocument(
        DATABASE_ID,
        TRANSACTION_COLLECTION,
        ID.unique(),
        {
          userId,
          type: "casino",
          amount: win > 0 ? win : -numericStake,
          status: "completed",
          ref: spinId,
          createdAt: new Date().toISOString()
        }
      );

      setSpinning(false);

      // =========================
      // RESET LOGIC
      // =========================
      if (outcome !== "FREE") {
        startReset();
      }

    }, 3000);
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ textAlign: "center", padding: 20, color: "#fff" }}>

      <h2>🎡 Casino Jackpot</h2>

      <button onClick={goBack}>⬅ Exit</button>

      <div style={{ margin: 10 }}>
        💰 ₦{Number(wallet?.balance || 0).toLocaleString()}
        <button onClick={loadWallet}>🔄</button>
      </div>

      <input
        type="number"
        placeholder="Minimum ₦50"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
      />

      <p>🎟 Free Spins: {freeSpins}</p>

      {/* WHEEL */}
      <div style={{
        margin: 30,
        fontSize: 80,
        transform: `rotate(${rotation}deg)`,
        transition: "transform 3s ease"
      }}>
        🎡
      </div>

      <button
        onClick={spin}
        style={{
          padding: 20,
          fontSize: 20,
          fontWeight: "bold",
          background: "gold",
          borderRadius: 10
        }}
      >
        {spinning ? "Spinning..." : "🎡 SPIN"}
      </button>

      <p>{result}</p>
      <p>🏆 Won: ₦{won}</p>

      {countdown !== null && (
        <p>🔄 Restarting in {countdown}s...</p>
      )}

    </div>
  );
}