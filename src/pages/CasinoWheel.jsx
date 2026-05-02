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

  const audioCtxRef = useRef(null);
  const tickerRef = useRef(null);

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

  // 🔥 FEED
  useEffect(() => {
    const i = setInterval(() => {
      const names = ["David", "Emma", "Mike"];
      const name = names[Math.floor(Math.random() * names.length)];
      const win = [200, 500, 3000][Math.floor(Math.random() * 3)];
      const id = Date.now();
      setFeed(f => [...f, { id, msg: `🎉 ${name} won ₦${win}` }]);
      setTimeout(() => {
        setFeed(f => f.filter(x => x.id !== id));
      }, 3000);
    }, 3000);
    return () => clearInterval(i);
  }, []);

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

  // 📊 RETURNS
  const getWinInfo = (s) => {
    const n = Number(s || 0);
    return [
      { l: "x2", v: n * 2 },
      { l: "x3", v: n * 3 },
      { l: "x10", v: n * 10 },
      { l: "x30", v: n * 30 }
    ];
  };

  return (
    <div style={{ display: "flex", color: "#fff" }}>

      {/* LEFT PANEL */}
      <div style={{ width: 120, padding: 10 }}>
        <h4>Returns</h4>
        {getWinInfo(stake).map((w,i)=>(
          <div key={i}>{w.l} → ₦{w.v}</div>
        ))}
      </div>

      {/* CENTER */}
      <div style={{ flex:1, textAlign:"center" }}>

        <button onClick={goBack}>← Exit</button>

        <h2>🎡 Casino Wheel</h2>

        <input
          value={stake}
          onChange={e=>setStake(e.target.value)}
          placeholder="₦50+"
        />

        {/* POINTER */}
        <div style={{ fontSize:24, zIndex:10 }}>🔻</div>

        {/* WHEEL CONTAINER (STRICT) */}
        <div style={{
          width:240,
          height:240,
          margin:"20px auto",
          position:"relative",
          zIndex:1
        }}>

          <div style={{
            width:"100%",
            height:"100%",
            borderRadius:"50%",
            overflow:"hidden",
            transform:`rotate(${rotation}deg)`,
            transition:"transform 4.5s cubic-bezier(.17,.67,.83,.67)"
          }}>
            {segments.map((seg,i)=>(
              <div key={i} style={{
                position:"absolute",
                width:"50%",
                height:"50%",
                top:"50%",
                left:"50%",
                transformOrigin:"0% 0%",
                transform:`rotate(${i*segmentAngle}deg) skewY(${90-segmentAngle}deg)`,
                background:seg.color
              }}>
                <span style={{
                  position:"absolute",
                  top:"-85%",
                  left:"15%",
                  transform:`skewY(-${90-segmentAngle}deg) rotate(${segmentAngle/2}deg)`,
                  fontSize:11,
                  fontWeight:"900",
                  color:"#fff"
                }}>
                  {seg.label}
                </span>
              </div>
            ))}
          </div>

        </div>

        <button onClick={spin}>
          {spinning ? "Spinning..." : "SPIN"}
        </button>

        <h3>{result}</h3>
        <h2>₦{won}</h2>

      </div>

      {/* RIGHT PANEL */}
      <div style={{ width:140, padding:10 }}>
        {feed.map(f=>(
          <div key={f.id}>{f.msg}</div>
        ))}
      </div>

    </div>
  );
}