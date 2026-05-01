import { useState, useRef, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

export default function CasinoWheel({ goBack }) {

  // =========================
  // STATE
  // =========================
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

  const audioCtxRef = useRef(null);
  const tickRef = useRef(null);

  // =========================
  // LOAD WALLET
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

    if (w.documents.length) setWallet(w.documents[0]);
  }

  // =========================
  // SEGMENTS
  // =========================
  const segments = [
    "❌ Lose","x2","🎁 Free","x3",
    "❌ Lose","x1","🔥 x10","💎 JACKPOT ×30"
  ];

  const segmentAngle = 360 / segments.length;

  // =========================
  // PROBABILITY POOL (FINAL)
  // =========================
  const pool = [
    { type: "LOSE", weight: 0.30 },
    { type: "LOSE2", weight: 0.30 },
    { type: "X1", weight: 0.11 },
    { type: "FREE", weight: 0.10 },
    { type: "X2", weight: 0.15 },
    { type: "X3", weight: 0.03 },
    { type: "X10", weight: 0.01 }
    // JACKPOT = 0%
  ];

  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.weight;
      if (r <= sum) return p.type;
    }
  };

  // =========================
  // SOUND (SAFE)
  // =========================
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

      o.frequency.value = 800;
      o.connect(g);
      g.connect(ctx.destination);

      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      o.start();
      o.stop(ctx.currentTime + 0.05);

      tickRef.current = setTimeout(tick, 80);
    };

    tick();

    return () => {
      running = false;
      clearTimeout(tickRef.current);
    };
  };

  // =========================
  // FLOWERS
  // =========================
  const spawnFlowers = () => {
    const items = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 2500);
  };

  // =========================
  // RESET (FAST)
  // =========================
  const fastReset = () => {
    let t = 3;
    setCountdown(t);

    const i = setInterval(() => {
      t--;
      setCountdown(t);

      if (t <= 0) {
        clearInterval(i);
        setRotation(0);
        setResult("");
        setWon(0);
        setOverlay(null);
        setCountdown(null);
      }
    }, 1000);
  };

  // =========================
  // SPIN
  // =========================
  const spin = async () => {
    if (spinning || countdown) return;

    const numericStake = Number(stake);

    if ((!numericStake || numericStake < 50) && freeSpins <= 0) {
      setResult("⚠️ Minimum ₦50");
      return;
    }

    if (freeSpins <= 0 && wallet.balance < numericStake) {
      setResult("❌ Insufficient balance");
      return;
    }

    const stopTick = startTick();

    setSpinning(true);
    setResult("");
    setWon(0);
    setOverlay(null);

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

      if (outcome === "LOSE" || outcome === "LOSE2") {
        if (freeSpins <= 0) newBalance -= numericStake;
        setOverlay("lose");
        setResult(`❌ Lost ₦${numericStake}`);

      } else if (outcome === "X1") {
        setOverlay("neutral");
        setResult("⚖️ No Gain");

      } else if (outcome === "FREE") {
        setFreeSpins(f => f + 1);
        setOverlay("win");
        setResult("🎁 Free Spin!");
        setSpinning(false);
        return; // ❗ NO RESET HERE
      } else {
        const mult = parseInt(outcome.replace("X",""));
        win = numericStake * mult;

        if (freeSpins <= 0) newBalance -= numericStake;
        newBalance += win;

        setWon(win);
        setOverlay("win");
        spawnFlowers();
        setResult(`🎉 Won ₦${win}`);
      }

      // UPDATE WALLET
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      setWallet({ ...wallet, balance: newBalance });

      // SAVE RECORD
      await databases.createDocument(
        DATABASE_ID,
        "casino_spins",
        ID.unique(),
        {
          userId,
          stake: numericStake,
          outcome,
          winAmount: win,
          balanceAfter: newBalance,
          createdAt: new Date().toISOString()
        }
      );

      setSpinning(false);
      fastReset();

    }, 3000);
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ textAlign: "center", color: "#fff", padding: 20 }}>

      <h2>🎡 Casino Jackpot</h2>

      <button onClick={goBack}>← Exit</button>

      {/* WALLET */}
      <div style={{ background: "#111", padding: 10, borderRadius: 10 }}>
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

      {/* POINTER */}
      <div style={{ fontSize: 26 }}>🔻</div>

      {/* WHEEL */}
      <div style={{
        width:240,height:240,margin:"10px auto",
        borderRadius:"50%",border:"6px solid gold",
        overflow:"hidden",
        transform:`rotate(${rotation}deg)`,
        transition:"transform 3s cubic-bezier(0.25,1,0.5,1)",
        position:"relative"
      }}>
        {segments.map((seg,i)=>(
          <div key={i} style={{
            position:"absolute",
            width:"50%",height:"50%",
            top:"50%",left:"50%",
            transformOrigin:"0% 0%",
            transform:`rotate(${i*segmentAngle}deg)`,
            background:`hsl(${i*45},80%,50%)`,
            clipPath:"polygon(0% 0%, 100% 50%, 0% 100%)"
          }}>
            <div style={{
              position:"absolute",
              left:"70%",
              top:"50%",
              transform:`translate(-50%,-50%) rotate(${segmentAngle/2}deg)`,
              fontWeight:"900",
              fontSize:13,
              color: seg.includes("JACKPOT") ? "gold":"white",
              textShadow:"0 0 6px #000"
            }}>
              {seg}
            </div>
          </div>
        ))}
      </div>

      <button onClick={spin} style={{
        padding:"18px 40px",
        fontSize:20,
        background:"gold",
        border:"none",
        borderRadius:10
      }}>
        {spinning ? "Spinning..." : "🎡 SPIN"}
      </button>

      <p>{result}</p>
      <p>🏆 ₦{won}</p>

      {countdown && <p>🔄 Reset in {countdown}s</p>}

      {/* OVERLAY */}
      {overlay && (
        <div style={{
          position:"fixed",top:0,left:0,width:"100%",height:"100%",
          background:"rgba(0,0,0,0.7)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:32,fontWeight:"bold"
        }}>
          {overlay === "win" ? `🏆 ₦${won}` : "😢 LOST"}
        </div>
      )}

      {/* FLOWERS */}
      {flowers.map(f => (
        <div key={f.id} style={{
          position:"fixed",
          top:-20,
          left:`${f.left}%`,
          fontSize:18,
          animation:"fall 2.5s linear forwards"
        }}>🌸</div>
      ))}

      <style>{`
        @keyframes fall {
          to { transform: translateY(110vh); opacity:0; }
        }
      `}</style>

    </div>
  );
}