import { useState, useRef, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

export default function CasinoWheel() {
  const segments = [
    "❌ Lose",
    "x2",
    "🎁 Free",
    "x3",
    "➖ -50%",
    "x1",
    "🔥 x10",
    "💎 JACKPOT ×30"
  ];

  const segmentAngle = 360 / segments.length;

  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [freeSpins, setFreeSpins] = useState(0);
  const [flowers, setFlowers] = useState([]);

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const audioCtxRef = useRef(null);

  // =========================
  // RESULT POOL
  // =========================
  const pool = [
    { type: "LOSE", weight: 0.39 },
    { type: "HALF", weight: 0.12 },
    { type: "X1", weight: 0.12 },
    { type: "FREE", weight: 0.08 },
    { type: "X2", weight: 0.20 },
    { type: "X3", weight: 0.08 },
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
  // LOAD USER + WALLET
  // =========================
  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (res.documents.length) {
      setWallet(res.documents[0]);
    }
  }

  // =========================
  // FX / SOUND
  // =========================
  const spawnFlowers = () => {
    const items = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 2500);
  };

  const playSound = (type) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;

    const tone = (f, d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.value = 0.1;
      o.start();
      setTimeout(() => o.stop(), d);
    };

    if (type === "win") [400, 700, 1000].forEach((f, i) =>
      setTimeout(() => tone(f, 200), i * 120)
    );

    if (type === "lose") [500, 300, 120].forEach((f, i) =>
      setTimeout(() => tone(f, 200), i * 150)
    );
  };

  const startResetCountdown = () => {
    let time = 5;
    setCountdown(time);

    const interval = setInterval(() => {
      time--;
      setCountdown(time);
      if (time <= 0) {
        clearInterval(interval);
        setRotation(0);
        setResult("");
        setOverlay(null);
        setCountdown(null);
      }
    }, 1000);
  };

  // =========================
  // SPIN (CONNECTED TO DB)
  // =========================
  const spin = async () => {
    if (spinning) return;

    const numericStake = Number(stake);

    if ((!numericStake || numericStake <= 0) && freeSpins <= 0) {
      setResult("⚠️ Enter valid stake");
      return;
    }

    if (freeSpins <= 0 && (wallet?.balance || 0) < numericStake) {
      setResult("❌ Insufficient balance");
      return;
    }

    setSpinning(true);
    setResult("");
    setOverlay(null);
    setWon(0);

    const outcome = getResult();

    const map = {
      LOSE: 0,
      X2: 1,
      FREE: 2,
      X3: 3,
      HALF: 4,
      X1: 5,
      X10: 6
    };

    const index = map[outcome];
    const stopAngle = 360 - (index * segmentAngle + segmentAngle / 2);
    const finalRotation = rotation + 1440 + stopAngle;

    setRotation(finalRotation);

    setTimeout(async () => {
      let text = "";
      let win = 0;
      let newBalance = Number(wallet?.balance || 0);

      if (outcome === "LOSE") {
        if (freeSpins <= 0) newBalance -= numericStake;
        text = `❌ Lost ₦${numericStake}`;
        playSound("lose");
        setOverlay("lose");

      } else if (outcome === "HALF") {
        if (freeSpins <= 0) newBalance -= numericStake / 2;
        text = `➖ Lost ₦${numericStake / 2}`;
        playSound("lose");
        setOverlay("lose");

      } else if (outcome === "X1") {
        text = "⚖️ No Gain";
        playSound("win");

      } else if (outcome === "FREE") {
        setFreeSpins((f) => f + 1);
        text = "🎁 Free Spin!";
        playSound("win");

      } else {
        const mult = parseInt(outcome.replace("X", ""));
        win = numericStake * mult;

        if (freeSpins <= 0) {
          newBalance = newBalance - numericStake + win;
        } else {
          newBalance = newBalance + win;
        }

        setWon(win);
        playSound("win");
        spawnFlowers();
        setOverlay("win");
        text = `🎉 Won ₦${win}`;
      }

      if (freeSpins > 0) {
        setFreeSpins((f) => f - 1);
      }

      // ✅ UPDATE WALLET
      try {
        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          wallet.$id,
          { balance: newBalance }
        );

        setWallet((w) => ({
          ...w,
          balance: newBalance
        }));
      } catch (err) {
        console.error("Wallet update failed", err);
      }

      // ✅ SAVE SPIN HISTORY
      try {
        await databases.createDocument(
          DATABASE_ID,
          "casino_spins",
          ID.unique(),
          {
            userId: user.$id,
            stake: numericStake,
            outcome,
            winAmount: win,
            balanceAfter: newBalance,
            createdAt: new Date().toISOString()
          }
        );
      } catch (err) {
        console.log("spin log failed", err);
      }

      setResult(text);
      setSpinning(false);
      startResetCountdown();

    }, 3000);
  };

  return (
    <>
      <div className="container">
        <h3>🎡 Casino Wheel</h3>

        <input
          type="number"
          placeholder="Enter stake..."
          value={stake}
          onChange={(e) => setStake(e.target.value)}
        />

        <p>💰 Balance: ₦{Number(wallet?.balance || 0)}</p>
        <p>🎟 Free Spins: {freeSpins}</p>

        <div
          className="wheel"
          style={{ transform: `rotate(${rotation}deg)` }}
        />

        <button onClick={spin}>
          {spinning ? "Spinning..." : "🎡 Spin"}
        </button>

        <p>{result}</p>

        {overlay && (
          <div>
            {overlay === "win" ? "🏆 WIN!" : "😢 LOST"}
          </div>
        )}
      </div>
    </>
  );
}