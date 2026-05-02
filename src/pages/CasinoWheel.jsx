import { useState, useRef, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  CASINO_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

// 🔄 VERSION
const APP_VERSION = "1.0.6";

export default function CasinoWheel({ goBack }) {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [popup, setPopup] = useState(null);
  const [flowers, setFlowers] = useState([]);

  const tickerRef = useRef(null);
  const audioCtxRef = useRef(null);

  // =========================
  // 🎯 PROBABILITY (UPDATED)
  // =========================
  const pool = [
    { type: "LOSE", w: 0.45 },
    { type: "LOSE2", w: 0.15 },
    { type: "X1", w: 0.1 },
    { type: "FREE", w: 0.1 },
    { type: "X2", w: 0.12 },
    { type: "X3", w: 0.03 },
    { type: "X10", w: 0.009 },
    { type: "JACKPOT", w: 0.001 }
  ];

  const probabilityMap = Object.fromEntries(pool.map(p => [p.type, p.w]));

  // =========================
  // SEGMENTS
  // =========================
  const segments = [
    { label: "❌ LOSE", type: "LOSE", color: "#ef4444" },
    { label: "x2", type: "X2", color: "#22c55e" },
    { label: "🎁 FREE", type: "FREE", color: "#3b82f6" },
    { label: "x3", type: "X3", color: "#a855f7" },
    { label: "❌ LOSE", type: "LOSE2", color: "#ef4444" },
    { label: "x1", type: "X1", color: "#f59e0b" },
    { label: "🔥 x10", type: "X10", color: "#f97316" },
    { label: "💎 ×30", type: "JACKPOT", color: "#eab308" }
  ];

  const segmentAngle = 360 / segments.length;

  const gradient = `conic-gradient(${segments
    .map((s, i) => `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`)
    .join(",")})`;

  const map = {
    LOSE: 0,
    X2: 1,
    FREE: 2,
    X3: 3,
    LOSE2: 4,
    X1: 5,
    X10: 6,
    JACKPOT: 7
  };

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    loadWallet();

    const saved = localStorage.getItem("app_version");
    if (saved !== APP_VERSION) {
      localStorage.setItem("app_version", APP_VERSION);
      window.location.reload();
    }

    // flower animation
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes fall {
        to {
          transform: translateY(110vh) rotate(360deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

  }, []);

  async function loadWallet() {
    const u = await account.get();
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );
    if (res.documents.length) setWallet(res.documents[0]);
  }

  // =========================
  // RESULT ENGINE
  // =========================
  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.w;
      if (r <= sum) return p.type;
    }
  };

  // =========================
  // SOUND
  // =========================
  const playTick = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 600;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => o.stop(), 40);
  };

  const startTicking = () => {
    let speed = 40;
    const loop = () => {
      playTick();
      speed += 6;
      tickerRef.current = setTimeout(loop, speed);
    };
    loop();
  };

  const stopTicking = () => clearTimeout(tickerRef.current);

  // =========================
  // FLOWERS
  // =========================
  function spawnFlowers() {
    const items = Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 3000);
  }

  // =========================
  // SPIN
  // =========================
  const spin = async () => {
    if (spinning || !wallet) return;

    const amount = Number(stake);

    if (!amount || amount < 50) {
      setResult("Minimum ₦50");
      return;
    }

    if (wallet.balance < amount) {
      setResult("Insufficient balance");
      return;
    }

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();
    const index = map[outcome];

    const target = index * segmentAngle + segmentAngle / 2;
    const stop = 360 - target;

    startTicking();
    setRotation(prev => prev % 360 + 1800 + stop);

    setTimeout(async () => {
      stopTicking();

      let balanceBefore = wallet.balance;
      let newBalance = wallet.balance - amount;
      let win = 0;
      let status = "lose";

      if (outcome === "FREE") {
        newBalance += amount;
        status = "free";
        setResult("🎁 Free Spin");

      } else if (outcome === "X1") {
        newBalance += amount;
        status = "neutral";
        setResult("⚖️ Stake Returned");

      } else if (!(outcome === "LOSE" || outcome === "LOSE2")) {
        const mult = outcome === "JACKPOT" ? 30 : parseInt(outcome.replace("X",""));
        win = amount * mult;
        newBalance += win;

        status = "win";
        setWon(win);
        setPopup("win");

        spawnFlowers();
        setResult(`🎉 ₦${win.toLocaleString()}`);
      } else {
        setResult(`❌ Lost ₦${amount}`);
      }

      // 💰 WALLET
      try {
        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          wallet.$id,
          { balance: newBalance }
        );
        setWallet(prev => ({ ...prev, balance: newBalance }));
      } catch (err) {
        alert("Wallet update failed");
      }

      // 🧾 SAVE
      try {
        const u = await account.get();

        await databases.createDocument(
          DATABASE_ID,
          CASINO_COLLECTION,
          ID.unique(),
          {
            userId: u.$id,
            type: "spin",
            status,
            outcome,
            stake: amount,
            winAmount: win,
            netChange: win - amount,
            balanceBefore,
            balanceAfter: newBalance,
            createdAt: new Date().toISOString()
          }
        );

      } catch (err) {
        console.error(err);
        alert("Spin not saved");
      }

      setSpinning(false);

    }, 4500);
  };

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>

      <button onClick={goBack}>← Back</button>

      <h2>🎡 Casino Wheel</h2>
      <h3>💰 ₦{Number(wallet?.balance || 0).toLocaleString()}</h3>

      <input
        type="number"
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="Enter stake"
      />

      <div>🔻</div>

      {/* 🎡 WHEEL */}
      <div style={{
        width: 260,
        height: 260,
        margin: "20px auto",
        borderRadius: "50%",
        background: gradient,
        transform: `rotate(${rotation}deg)`,
        transition: "transform 4.5s cubic-bezier(.17,.67,.83,.67)"
      }}>
        {segments.map((seg, i) => {
          const angle = i * segmentAngle + segmentAngle / 2;
          return (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `rotate(${angle}deg) translate(0, -95px) rotate(-${angle}deg)`
            }}>
              <div style={{ fontSize: 12, fontWeight: "bold" }}>
                {seg.label}
                <div style={{ fontSize: 10 }}>
                  {(probabilityMap[seg.type] * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={spin}>
        {spinning ? "Spinning..." : "SPIN"}
      </button>

      <h3>{result}</h3>
      <h2>₦{won}</h2>

      {/* 🌸 FLOWERS */}
      {flowers.map(f => (
        <div key={f.id} style={{
          position: "fixed",
          top: "-20px",
          left: `${f.left}%`,
          animation: "fall 3s linear forwards"
        }}>
          🌸
        </div>
      ))}

    </div>
  );
}