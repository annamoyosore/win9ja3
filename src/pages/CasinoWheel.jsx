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

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [freeSpins, setFreeSpins] = useState(0);
  const [feed, setFeed] = useState([]);

  const audioCtxRef = useRef(null);
  const tickerRef = useRef(null);

  // =========================
  // LOAD WALLET
  // =========================
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

  // =========================
  // 🎡 SEGMENTS
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

  const pool = [
    { type: "LOSE", weight: 0.39 },
    { type: "LOSE2", weight: 0.05 },
    { type: "X1", weight: 0.1 },
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
    const loop = () => {
      playTick();
      speed += 6;
      tickerRef.current = setTimeout(loop, speed);
    };
    loop();
  };

  const stopTicking = () => clearTimeout(tickerRef.current);

  // =========================
  // 📊 WIN INFO
  // =========================
  const getWinInfo = (s) => {
    const n = Number(s || 0);
    return [
      { l: "x2", v: n * 2 },
      { l: "x3", v: n * 3 },
      { l: "x10", v: n * 10 },
      { l: "x30", v: n * 30 }
    ];
  };

  // =========================
  // 🔥 LIVE FEED
  // =========================
  useEffect(() => {
    const names = ["John", "Mike", "Emma", "David"];
    const i = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)];
      const stake = [100, 500, 1000][Math.floor(Math.random() * 3)];
      const mult = [2, 3, 10, 30][Math.floor(Math.random() * 4)];
      const msg = mult === 30
        ? `💎 ${name} hit ₦${(stake * mult).toLocaleString()}`
        : `🎉 ${name} won ₦${(stake * mult).toLocaleString()}`;

      const id = Date.now();
      setFeed(f => [...f, { id, msg }]);

      setTimeout(() => {
        setFeed(f => f.filter(x => x.id !== id));
      }, 4000);

    }, 3000);

    return () => clearInterval(i);
  }, []);

  // =========================
  // 🎡 SPIN
  // =========================
  const spin = async () => {
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

    const targetAngle = index * segmentAngle + segmentAngle / 2;
    const stopAngle = 360 - targetAngle;

    const duration = 4500 + Math.random() * 1000;

    startTicking();

    setRotation(prev => prev % 360 + 1800 + stopAngle);

    setTimeout(() => {
      setRotation(prev => Math.round(prev / segmentAngle) * segmentAngle);
    }, duration - 150);

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

        setFeed(f => [...f, {
          id: Date.now(),
          msg: `🎉 You won ₦${win.toLocaleString()}`
        }]);
      } else {
        setResult("❌ Lose");
      }

      setSpinning(false);
    }, duration);
  };

  // =========================
  // 🎨 UI
  // =========================
  return (
    <div style={{ display: "flex", color: "#fff" }}>

      {/* LEFT PANEL */}
      <div style={{ width: 150, padding: 10 }}>
        <h4>Returns</h4>
        {getWinInfo(stake).map((w, i) => (
          <div key={i}>
            {w.l} → ₦{w.v.toLocaleString()}
          </div>
        ))}
      </div>

      {/* CENTER GAME */}
      <div style={{ flex: 1, textAlign: "center" }}>

        <button onClick={goBack}>← Exit</button>

        <h2>🎡 Casino Wheel</h2>

        <input
          value={stake}
          onChange={e => setStake(e.target.value)}
          placeholder="₦50+"
        />

        {/* POINTER */}
        <div style={{ fontSize: 26 }}>🔻</div>

        {/* WHEEL */}
        <div
          style={{
            width: 260,
            height: 260,
            margin: "20px auto",
            borderRadius: "50%",
            position: "relative",
            transform: `rotate(${rotation}deg)`,
            transition: "transform 4.5s cubic-bezier(.17,.67,.83,.67)"
          }}
        >
          {segments.map((seg, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width: "50%",
                height: "50%",
                top: "50%",
                left: "50%",
                transformOrigin: "0% 0%",
                transform: `rotate(${i * segmentAngle}deg) skewY(${90 - segmentAngle}deg)`,
                background: seg.color
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-100%",
                  left: "0%",
                  transform: `skewY(-${90 - segmentAngle}deg) rotate(${segmentAngle / 2}deg)`,
                  fontSize: 10,
                  fontWeight: "bold"
                }}
              >
                {seg.label}
              </span>
            </div>
          ))}
        </div>

        <button onClick={spin}>
          {spinning ? "Spinning..." : "SPIN"}
        </button>

        <h3>{result}</h3>
        <h2>₦{won}</h2>

      </div>

      {/* RIGHT LIVE FEED */}
      <div style={{ width: 160, padding: 10 }}>
        {feed.map(f => (
          <div key={f.id}>{f.msg}</div>
        ))}
      </div>

    </div>
  );
}