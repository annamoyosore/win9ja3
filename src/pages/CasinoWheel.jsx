import { useState, useRef, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query
} from "../lib/appwrite";

export default function CasinoWheel({ goBack }) {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [feed, setFeed] = useState([]);

  const tickerRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    (async () => {
      const u = await account.get();
      const w = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );
      if (w.documents.length) setWallet(w.documents[0]);
    })();
  }, []);

  // 🎡 SEGMENTS
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

  // 🎨 CONIC GRADIENT (locks colors perfectly)
  const gradient = `conic-gradient(
    ${segments.map((s, i) =>
      `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`
    ).join(",")}
  )`;

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

  const getResult = () => {
    const pool = [
      { type: "LOSE", w: 0.39 },
      { type: "LOSE2", w: 0.05 },
      { type: "X1", w: 0.1 },
      { type: "FREE", w: 0.24 },
      { type: "X2", w: 0.18 },
      { type: "X3", w: 0.03 },
      { type: "X10", w: 0.009 },
      { type: "JACKPOT", w: 0.001 }
    ];

    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.w;
      if (r <= sum) return p.type;
    }
  };

  // 🔊 SOUND
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

  // 🎡 SPIN
  const spin = () => {
    if (spinning) return;

    const amount = Number(stake);
    if (!amount || amount < 50) {
      setResult("Min ₦50");
      return;
    }

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();
    const index = map[outcome];

    const target = index * segmentAngle + segmentAngle / 2;
    const stop = 360 - target;

    const duration = 4500;

    startTicking();

    setRotation(prev => prev % 360 + 1800 + stop);

    setTimeout(() => {
      stopTicking();

      let win = 0;
      if (outcome === "X2") win = amount * 2;
      if (outcome === "X3") win = amount * 3;
      if (outcome === "X10") win = amount * 10;
      if (outcome === "JACKPOT") win = amount * 30;

      if (win > 0) {
        setWon(win);
        setResult(`🎉 ₦${win.toLocaleString()}`);
      } else {
        setResult("❌ Lose");
      }

      setSpinning(false);
    }, duration);
  };

  return (
    <div style={{ display: "flex", color: "#fff" }}>

      {/* LEFT RETURNS */}
      <div style={{ width: 120, padding: 10 }}>
        <h4>Returns</h4>
        <div>x2 → ₦{Number(stake || 0) * 2}</div>
        <div>x3 → ₦{Number(stake || 0) * 3}</div>
        <div>x10 → ₦{Number(stake || 0) * 10}</div>
        <div>x30 → ₦{Number(stake || 0) * 30}</div>
      </div>

      {/* CENTER */}
      <div style={{ flex: 1, textAlign: "center" }}>

        <button onClick={goBack}>← Exit</button>

        <h2>🎡 Casino Wheel</h2>

        {/* 💰 WALLET */}
        <h3>💰 ₦{Number(wallet?.balance || 0).toLocaleString()}</h3>

        <input
          value={stake}
          onChange={e => setStake(e.target.value)}
          placeholder="₦50+"
        />

        {/* POINTER */}
        <div style={{ fontSize: 26 }}>🔻</div>

        {/* 🎡 WHEEL */}
        <div style={{
          width: 260,
          height: 260,
          margin: "20px auto",
          borderRadius: "50%",
          background: gradient,
          position: "relative",
          transform: `rotate(${rotation}deg)`,
          transition: "transform 4.5s cubic-bezier(.17,.67,.83,.67)"
        }}>
          {segments.map((seg, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `rotate(${i * segmentAngle + segmentAngle / 2}deg) translate(90px) rotate(90deg)`,
              transformOrigin: "center",
              fontWeight: "900",
              fontSize: 12,
              color: "#fff"
            }}>
              {seg.label}
            </div>
          ))}
        </div>

        <button onClick={spin}>
          {spinning ? "Spinning..." : "SPIN"}
        </button>

        <h3>{result}</h3>
        <h2>₦{won}</h2>

      </div>

      {/* RIGHT FEED */}
      <div style={{ width: 140, padding: 10 }}>
        {feed.map(f => (
          <div key={f.id}>{f.msg}</div>
        ))}
      </div>

    </div>
  );
}