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

  const audioCtxRef = useRef(null);

  // ================= LOAD WALLET =================
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
    "❌ Lose",
    "x2",
    "🎁 Free",
    "x3",
    "❌ Lose",
    "x1",
    "🔥 x10",
    "💎 JACKPOT ×30"
  ];

  const segmentAngle = 360 / segments.length;

  // ================= UPDATED PROBABILITY =================
  const pool = [
    { type: "LOSE", weight: 0.51 },
    { type: "LOSE2", weight: 0.10 },
    { type: "X1", weight: 0.10 },
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
  const playTick = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;

    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.connect(g);
    g.connect(ctx.destination);

    o.frequency.value = 500;
    g.gain.value = 0.05;

    o.start();
    setTimeout(() => o.stop(), 50);
  };

  // ================= CONFETTI =================
  const spawnFlowers = () => {
    const items = Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 2500);
  };

  // ================= RESET =================
  const startCountdown = () => {
    let t = 4;
    setCountdown(t);

    const int = setInterval(() => {
      t--;
      setCountdown(t);

      if (t <= 0) {
        clearInterval(int);
        resetGame();
      }
    }, 1000);
  };

  const resetGame = () => {
    setRotation(0);
    setResult("");
    setWon(0);
    setCountdown(null);
    setPopup(null);
  };

  // ================= SPIN =================
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

    let spinSound = setInterval(playTick, 120);

    setRotation(prev => prev + 1440 + stopAngle);

    setTimeout(async () => {
      clearInterval(spinSound);

      let win = 0;
      let newBalance = wallet.balance;
      let isFree = false;

      if (outcome === "LOSE" || outcome === "LOSE2") {
        if (freeSpins <= 0) newBalance -= numericStake;
        setPopup("lose");
        setResult(`❌ Lost ₦${numericStake}`);

      } else if (outcome === "FREE") {
        setFreeSpins(f => f + 1);
        setPopup("free");
        setResult("🎁 Free Spin!");
        setSpinning(false);
        return;

      } else if (outcome === "X1") {
        setPopup("neutral");
        setResult("⚖️ No Gain");

      } else {
        const mult = parseInt(outcome.replace("X", ""));
        win = numericStake * mult;

        if (freeSpins <= 0) newBalance -= numericStake;
        newBalance += win;

        setWon(win);
        spawnFlowers();
        setPopup("win");
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
      startCountdown();

    }, 3000);
  };

  return (
    <>
      <style>{`
        .wheel {
          width:240px;
          height:240px;
          border-radius:50%;
          border:6px solid gold;
          position:relative;
          overflow:hidden;
          margin:auto;
          transition:transform 3s ease;
        }

        .segment {
          position:absolute;
          width:50%;
          height:50%;
          top:50%;
          left:50%;
          transform-origin:0% 0%;
          display:flex;
          align-items:center;
          justify-content:center;
          clip-path: polygon(0% 0%, 100% 50%, 0% 100%);
          font-weight:900;
          font-size:13px;
          color:white;
          text-shadow:0 0 6px black;
        }

        .label {
          position:absolute;
          left:65%;
          transform: rotate(45deg);
        }

        .pointer {
          font-size:26px;
          text-align:center;
        }

        .spinBtn {
          margin-top:15px;
          padding:16px 40px;
          font-size:20px;
          font-weight:bold;
          background:gold;
          border:none;
          border-radius:12px;
        }

        .popup {
          position:fixed;
          top:40%;
          left:50%;
          transform:translate(-50%,-50%);
          padding:25px;
          font-size:26px;
          font-weight:900;
          border-radius:15px;
          z-index:999;
          animation:pop 0.4s ease;
        }

        .win { background:gold; color:black; }
        .lose { background:red; }
        .free { background:purple; }
        .neutral { background:#333; }

        @keyframes pop {
          from { transform:translate(-50%,-50%) scale(0.6); opacity:0; }
          to { transform:translate(-50%,-50%) scale(1); opacity:1; }
        }

        .confetti {
          position:fixed;
          top:-20px;
          font-size:20px;
          animation:fall 2.5s linear forwards;
        }

        @keyframes fall {
          to { transform:translateY(110vh); opacity:0; }
        }
      `}</style>

      <div style={{ textAlign:"center", color:"#fff", padding:20 }}>

        <button onClick={goBack}>← Exit</button>

        <h2>🎡 Casino Jackpot</h2>

        <div>
          💰 ₦{Number(wallet?.balance || 0).toLocaleString()}
          <button onClick={loadWallet}>🔄</button>
        </div>

        <input
          type="number"
          placeholder="Min ₦50"
          value={stake}
          onChange={(e)=>setStake(e.target.value)}
        />

        <p>🎟 Free Spins: {freeSpins}</p>

        <div className="pointer">🔻</div>

        <div className="wheel" style={{ transform:`rotate(${rotation}deg)` }}>
          {segments.map((s,i)=>(
            <div
              key={i}
              className="segment"
              style={{
                transform:`rotate(${i*segmentAngle}deg)`,
                background:`hsl(${i*45},80%,50%)`
              }}
            >
              <span className="label">{s}</span>
            </div>
          ))}
        </div>

        <button className="spinBtn" onClick={spin}>
          {spinning ? "Spinning..." : "🎡 SPIN"}
        </button>

        <p>{result}</p>
        <p>🏆 ₦{won}</p>

        {countdown && <p>Next spin in {countdown}s...</p>}

        {popup && (
          <div className={`popup ${popup}`}>
            {popup === "win" && `🎉 ₦${won}`}
            {popup === "lose" && "❌ LOST"}
            {popup === "free" && "🎁 FREE SPIN"}
            {popup === "neutral" && "⚖️ SAME"}
          </div>
        )}

        {flowers.map(f=>(
          <div key={f.id} className="confetti" style={{left:`${f.left}%`}}>
            🌸
          </div>
        ))}

      </div>
    </>
  );
}