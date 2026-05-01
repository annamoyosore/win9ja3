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
  const [overlay, setOverlay] = useState(null);
  const [flowers, setFlowers] = useState([]);

  const [winnerPop, setWinnerPop] = useState(null);
  const [feed, setFeed] = useState([]);

  const audioCtxRef = useRef(null);
  const tickRef = useRef(null);

  // ================= LOAD =================
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

  // ================= SEGMENTS =================
  const segments = [
    "❌ Lose","x2","🎁 Free","x3",
    "❌ Lose","x1","🔥 x10","💎 JACKPOT ×30"
  ];

  const segmentAngle = 360 / segments.length;

  // ================= PROBABILITY =================
  const pool = [
    { type: "LOSE", weight: 0.30 },
    { type: "LOSE2", weight: 0.30 },
    { type: "X1", weight: 0.11 },
    { type: "FREE", weight: 0.10 },
    { type: "X2", weight: 0.15 },
    { type: "X3", weight: 0.03 },
    { type: "X10", weight: 0.01 }
  ];

  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.weight;
      if (r <= sum) return p.type;
    }
  };

  // ================= SOUND =================
  const startTick = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;

    let running = true;

    const tick = () => {
      if (!running) return;

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.frequency.value = 700;
      o.connect(g);
      g.connect(ctx.destination);

      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      o.start();
      o.stop(ctx.currentTime + 0.05);

      tickRef.current = setTimeout(tick, 90);
    };

    tick();

    return () => {
      running = false;
      clearTimeout(tickRef.current);
    };
  };

  // ================= FLOWERS =================
  const spawnFlowers = () => {
    const items = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 2500);
  };

  // ================= FEED =================
  const names = ["Emeka","Tunde","Chioma","Ibrahim","Zainab","Kelvin","Uche","Mary"];

  useEffect(() => {
    const interval = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)];
      const amount = Math.floor(Math.random() * 50000) + 2000;
      const id = Date.now();

      setFeed(prev => [...prev, {
        id,
        text: `${name} won ₦${amount.toLocaleString()} 🎉`
      }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 4000);

    }, 6000);

    return () => clearInterval(interval);
  }, []);

  // ================= RESULT =================
  const startCountdown = () => {
    let time = 3;
    setCountdown(time);

    const interval = setInterval(() => {
      time--;
      setCountdown(time);

      if (time <= 0) {
        clearInterval(interval);
        setRotation(0);
        setResult("");
        setWon(0);
        setOverlay(null);
        setCountdown(null);
      }
    }, 1000);
  };

  // ================= SPIN =================
  const spin = async () => {
    if (spinning) return;

    const numericStake = Number(stake);

    if ((!numericStake || numericStake < 50) && freeSpins <= 0) {
      return setResult("⚠️ Minimum ₦50");
    }

    if (freeSpins <= 0 && wallet.balance < numericStake) {
      return setResult("❌ Insufficient balance");
    }

    const stopTick = startTick();

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();

    const map = {
      LOSE: 0,
      X2: 1,
      FREE: 2,
      X3: 3,
      LOSE2: 4,
      X1: 5,
      X10: 6
    };

    const index = map[outcome];
    const stopAngle = 360 - (index * segmentAngle + segmentAngle / 2);

    setRotation(prev => prev + 1440 + stopAngle);

    setTimeout(async () => {
      stopTick();

      let win = 0;
      let newBalance = wallet.balance;
      let isFree = false;

      if (outcome === "LOSE" || outcome === "LOSE2") {
        if (freeSpins <= 0) newBalance -= numericStake;
        setResult(`❌ Lost ₦${numericStake}`);
        setOverlay("lose");

      } else if (outcome === "X1") {
        setResult("⚖️ No Gain");
        setOverlay("neutral");

      } else if (outcome === "FREE") {
        setFreeSpins(f => f + 1);
        setResult("🎁 Free Spin!");
        isFree = true;

      } else {
        const mult = parseInt(outcome.replace("X",""));
        win = numericStake * mult;

        if (freeSpins <= 0) newBalance -= numericStake;
        newBalance += win;

        setWon(win);
        spawnFlowers();
        setOverlay("win");

        if (win >= numericStake * 3) {
          setWinnerPop(`🎉 BIG WIN ₦${win}`);
          setTimeout(()=>setWinnerPop(null),3000);
        }

        setResult(`🎉 Won ₦${win}`);
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      setWallet({ ...wallet, balance: newBalance });

      await databases.createDocument(
        DATABASE_ID,
        CASINO_COLLECTION,
        ID.unique(),
        { userId, stake: numericStake, outcome, winAmount: win }
      );

      setSpinning(false);

      if (!isFree) startCountdown();

    }, 3000);
  };

  return (
    <>
      <style>{`
        .wheel-container {
          width:240px;height:240px;margin:20px auto;position:relative;
        }
        .pointer {
          position:absolute;top:-18px;left:50%;
          transform:translateX(-50%);
          font-size:26px;z-index:10;
        }
        .wheel {
          width:100%;height:100%;
          border-radius:50%;
          border:6px solid gold;
          overflow:hidden;
          transition:transform 3s cubic-bezier(0.25,1,0.5,1);
        }
        .segment {
          position:absolute;
          width:50%;height:50%;
          top:50%;left:50%;
          transform-origin:0% 0%;
          display:flex;
          align-items:center;
          justify-content:flex-end;
          padding-right:12px;
          clip-path: polygon(0% 0%, 100% 50%, 0% 100%);
        }
        .label {
          font-size:14px;
          font-weight:900;
          color:white;
          text-shadow:0 0 6px black;
        }
        .jackpot {
          color:gold;
          text-shadow:0 0 10px gold,0 0 20px gold;
        }
        .confetti {
          position:fixed;
          top:-20px;
          animation:fall 2.5s linear forwards;
        }
        @keyframes fall {
          to { transform:translateY(110vh); opacity:0; }
        }
      `}</style>

      <div style={{ textAlign:"center", color:"#fff", padding:20 }}>

        <button onClick={goBack}>← Exit</button>

        <h2>🎡 Casino Jackpot</h2>

        <div style={{ background:"#111", padding:10 }}>
          💰 ₦{Number(wallet?.balance || 0).toLocaleString()}
          <button onClick={loadWallet}>🔄</button>
        </div>

        <input
          type="number"
          placeholder="Minimum ₦50"
          value={stake}
          onChange={(e)=>setStake(e.target.value)}
        />

        <p>🎟 Free Spins: {freeSpins}</p>

        <div className="wheel-container">
          <div className="pointer">🔻</div>

          <div className="wheel" style={{ transform:`rotate(${rotation}deg)` }}>
            {segments.map((seg,i)=>(
              <div
                key={i}
                className="segment"
                style={{
                  transform:`rotate(${i*segmentAngle}deg)`,
                  background:`hsl(${i*45},80%,50%)`
                }}
              >
                <span className={`label ${seg.includes("JACKPOT")?"jackpot":""}`}>
                  {seg}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={spin} style={{
          padding:"18px 40px",
          fontSize:20,
          fontWeight:"bold",
          background:"gold"
        }}>
          {spinning ? "Spinning..." : "🎡 SPIN"}
        </button>

        <p>{result}</p>
        {countdown !== null && <p>🔄 {countdown}s</p>}

        {winnerPop && (
          <div style={{
            position:"fixed",
            top:"40%",
            left:"50%",
            transform:"translate(-50%,-50%)",
            background:"gold",
            padding:20,
            fontWeight:"bold"
          }}>
            {winnerPop}
          </div>
        )}

        {feed.map(f=>(
          <div key={f.id} style={{ position:"fixed", top:10 }}>
            {f.text}
          </div>
        ))}

        {flowers.map(f=>(
          <div key={f.id} className="confetti" style={{ left:`${f.left}%` }}>
            🌸
          </div>
        ))}

      </div>
    </>
  );
}