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
  const [popup, setPopup] = useState(null);
  const [flowers, setFlowers] = useState([]);
  const [feed, setFeed] = useState([]);

  const audioCtxRef = useRef(null);
  const tickerRef = useRef(null);

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

    if (w.documents.length) setWallet(w.documents[0]);
  }

  // =========================
  // 🎡 SEGMENTS (LOCKED)
  // =========================
  const segments = [
    { label: "❌ LOSE", type: "LOSE", color: "#ef4444" },
    { label: "x2", type: "X2", color: "#22c55e" },
    { label: "🎁 FREE", type: "FREE", color: "#3b82f6" },
    { label: "x3", type: "X3", color: "#a855f7" },
    { label: "❌ LOSE", type: "LOSE2", color: "#ef4444" },
    { label: "x1", type: "X1", color: "#f59e0b" },
    { label: "🔥 x10", type: "X10", color: "#f97316" },
    { label: "💎 JACKPOT ×30", type: "JACKPOT", color: "#eab308" }
  ];

  const segmentAngle = 360 / segments.length;

  const pool = [
    { type: "LOSE", weight: 0.39 },
    { type: "LOSE2", weight: 0.05 },
    { type: "X1", weight: 0.10 },
    { type: "FREE", weight: 0.24 },
    { type: "X2", weight: 0.18 },
    { type: "X3", weight: 0.03 },
    { type: "X10", weight: 0.009 },
    { type: "JACKPOT", weight: 0.001 }
  ];

  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.weight;
      if (r <= sum) return p.type;
    }
  };

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
  // 🔊 SOUND
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

    const tickLoop = () => {
      playTick();
      speed += 6;
      tickerRef.current = setTimeout(tickLoop, speed);
    };

    tickLoop();
  };

  const stopTicking = () => {
    clearTimeout(tickerRef.current);
  };

  // =========================
  // 🌸 EFFECTS
  // =========================
  const spawnFlowers = () => {
    const items = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 3000);
  };

  // =========================
  // 🎯 WIN INFO
  // =========================
  function getWinInfo(amount) {
    const s = Number(amount || 0);
    return [
      { label: "x1", value: s },
      { label: "x2", value: s * 2 },
      { label: "x3", value: s * 3 },
      { label: "🔥 x10", value: s * 10 },
      { label: "💎 x30", value: s * 30 }
    ];
  }

  // =========================
  // 🔥 LIVE FEED
  // =========================
  useEffect(() => {
    const names = ["John", "Mike", "David", "Chris", "Alex", "Emma"];

    const interval = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)];
      const stake = [100, 200, 500, 1000][Math.floor(Math.random() * 4)];
      const mult = [2, 3, 10, 30][Math.floor(Math.random() * 4)];
      const win = stake * mult;

      const msg =
        mult === 30
          ? `💎 ${name} hit JACKPOT ₦${win.toLocaleString()}`
          : `🎉 ${name} won ₦${win.toLocaleString()}`;

      const id = Date.now();

      setFeed(prev => [...prev, { id, msg }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 4000);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // =========================
  // 🎡 SPIN
  // =========================
  const spin = async () => {
    if (spinning) return;

    const numericStake = Number(stake);

    if ((!numericStake || numericStake < 50) && freeSpins <= 0) {
      setResult("⚠️ Minimum stake ₦50");
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

    const outcome = getResult();
    const index = map[outcome];

    const targetAngle = index * segmentAngle + segmentAngle / 2;
    const stopAngle = 360 - targetAngle;

    const spinDuration = 4500 + Math.random() * 1000;

    startTicking();

    setRotation(prev => prev % 360 + 1800 + stopAngle);

    setTimeout(() => {
      setRotation(prev => Math.round(prev / segmentAngle) * segmentAngle);
    }, spinDuration - 180);

    setTimeout(async () => {
      stopTicking();

      let newBalance = wallet.balance;
      let win = 0;

      if (freeSpins > 0) {
        setFreeSpins(f => f - 1);
      } else {
        newBalance -= numericStake;
      }

      if (outcome === "LOSE" || outcome === "LOSE2") {
        setResult(`❌ Lost ₦${numericStake}`);
        setPopup("lose");

      } else if (outcome === "FREE") {
        setFreeSpins(f => f + 1);
        setResult("🎁 Free Spin!");
        setPopup("free");

      } else if (outcome === "X1") {
        newBalance += numericStake;
        setResult("⚖️ Stake Returned");
        setPopup("neutral");

      } else {
        const mult = outcome === "JACKPOT" ? 30 : parseInt(outcome.replace("X",""));
        win = numericStake * mult;
        newBalance += win;

        setWon(win);
        spawnFlowers();
        setPopup("win");

        setResult(
          outcome === "JACKPOT"
            ? `💎 JACKPOT ₦${win.toLocaleString()}`
            : `🎉 Won ₦${win.toLocaleString()}`
        );

        // push to live feed
        setFeed(prev => [
          ...prev,
          { id: Date.now(), msg: `🎉 You won ₦${win.toLocaleString()}` }
        ]);
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      setWallet({ ...wallet, balance: newBalance });

      setSpinning(false);

    }, spinDuration);
  };

  // =========================
  // 🎨 UI
  // =========================
  return (
    <div style={{ textAlign: "center", color: "#fff" }}>

      <button onClick={goBack}>← Exit</button>

      <h2>🎡 Casino Jackpot</h2>

      <h3>💰 ₦{Number(wallet?.balance || 0).toLocaleString()}</h3>

      <input
        type="number"
        placeholder="Min ₦50"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
      />

      {/* WIN INFO */}
      <div>
        {getWinInfo(stake).map((w, i) => (
          <div key={i}>
            {w.label} → ₦{w.value.toLocaleString()}
          </div>
        ))}
      </div>

      {/* POINTER */}
      <div style={{ fontSize: 24 }}>🔻</div>

      {/* WHEEL */}
      <div
        style={{
          margin: "20px auto",
          width: 250,
          height: 250,
          borderRadius: "50%",
          transform: `rotate(${rotation}deg)`,
          transition: "transform 4.5s cubic-bezier(.17,.67,.83,.67)"
        }}
      >
        {segments.map((seg, i) => (
          <div key={i}>{seg.label}</div>
        ))}
      </div>

      <button onClick={spin} disabled={spinning}>
        {spinning ? "Spinning..." : "🎡 SPIN"}
      </button>

      <h3>{result}</h3>
      <h2>🏆 ₦{won}</h2>

      {/* LIVE FEED */}
      <div style={{ position: "fixed", right: 10, top: 20 }}>
        {feed.map(f => (
          <div key={f.id}>{f.msg}</div>
        ))}
      </div>

    </div>
  );
}