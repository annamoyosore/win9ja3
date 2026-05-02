import { useState, useEffect, useRef } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  CASINO_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

const names = ["Emeka","Tunde","Chioma","Ibrahim","Mary","David","Zainab"];
const cities = ["Lagos","Abuja","Ibadan","Kano","Enugu"];

// 🎯 PROBABILITY CONFIG
const PROB = {
  LOSE: 33.5,
  LOSE2: 14,
  FREE: 7,
  X1: 20,
  X2: 20,
  X3: 4,
  X10: 1,
  JACKPOT: 0.5
};

export default function CasinoWheel() {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [feed, setFeed] = useState([]);
  const [flowers, setFlowers] = useState([]);
  const [glow, setGlow] = useState(false);
  const [flashIndex, setFlashIndex] = useState(null);

  const soundRef = useRef(null);

  const segments = [
    { label: "LOSE", type: "LOSE", color: "#ef4444" },
    { label: "x2", type: "X2", color: "#22c55e" },
    { label: "FREE", type: "FREE", color: "#3b82f6" },
    { label: "x3", type: "X3", color: "#a855f7" },
    { label: "LOSE", type: "LOSE2", color: "#ef4444" },
    { label: "x1", type: "X1", color: "#f59e0b" },
    { label: "x10", type: "X10", color: "#f97316" },
    { label: "💎30", type: "JACKPOT", color: "#eab308" }
  ];

  const segmentAngle = 360 / segments.length;

  const gradient = `conic-gradient(from -90deg, ${segments
    .map((s, i) => `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`)
    .join(",")})`;

  // 🔊 tick
  function tick() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 800;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.015);
    } catch {}
  }

  function playRollingSound(duration = 4000) {
    let elapsed = 0;

    function loop() {
      if (elapsed >= duration) return;
      tick();

      const progress = elapsed / duration;
      const delay = 30 + progress * 120;

      elapsed += delay;
      soundRef.current = setTimeout(loop, delay);
    }

    loop();
  }

  useEffect(() => {
    loadWallet();

    const interval = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const amount = Math.floor(Math.random() * 50000) + 2000;

      const id = Date.now();
      setFeed(prev => [...prev, {
        id,
        msg: `💰 ${name} from ${city} won ₦${amount}`
      }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 3500);

    }, 4000);

    return () => {
      clearInterval(interval);
      clearTimeout(soundRef.current);
    };
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

  // 🎯 PROB ENGINE
  const getResult = () => {
    const r = Math.random() * 100;
    let sum = 0;
    for (let key in PROB) {
      sum += PROB[key];
      if (r <= sum) return key;
    }
    return "LOSE";
  };

  // 🎯 DYNAMIC RETURNS CALC
  const amount = Number(stake) || 0;

  const multipliers = {
    LOSE: 0,
    LOSE2: 0,
    FREE: 1,
    X1: 1,
    X2: 2,
    X3: 3,
    X10: 10,
    JACKPOT: 30
  };

  let expectedValue = 0;
  let winChance = 0;
  let loseChance = 0;

  Object.keys(PROB).forEach(key => {
    const prob = PROB[key] / 100;
    const mult = multipliers[key];

    expectedValue += prob * mult * amount;

    if (mult > 0) winChance += PROB[key];
    else loseChance += PROB[key];
  });

  function spawnFlowers() {
    const items = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 3000);
  }

  const spin = async () => {
    if (spinning || !wallet) return;

    const bet = Number(stake);
    if (!bet || bet < 50) return;
    if (wallet.balance < bet) return;

    setSpinning(true);
    setGlow(true);

    playRollingSound();

    let deducted = wallet.balance - bet;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: deducted }
    );

    setWallet(prev => ({ ...prev, balance: deducted }));

    const outcome = getResult();
    const index = segments.findIndex(s => s.type === outcome);

    const centerAngle = index * segmentAngle + segmentAngle / 2;
    const finalAngle = 360 * 5 + (360 - centerAngle);

    setRotation(finalAngle);

    setTimeout(async () => {

      let win = 0;
      const mult = multipliers[outcome];

      if (outcome === "FREE") {
        win = bet;
        setResult("🎁 FREE SPIN");
      } else if (mult) {
        win = bet * mult;
        setResult(`🎉 WON ₦${win}`);
        setWon(win);
        if (mult >= 10) spawnFlowers();
      } else {
        setResult("❌ LOST");
      }

      const finalBalance = deducted + win;

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: finalBalance }
      );

      setWallet(prev => ({ ...prev, balance: finalBalance }));

      await databases.createDocument(
        DATABASE_ID,
        CASINO_COLLECTION,
        ID.unique(),
        {
          userId: wallet.userId || wallet.$id,
          stake: bet,
          win,
          result: outcome,
          createdAt: new Date().toISOString()
        }
      );

      setFlashIndex(index);
      setGlow(false);
      setSpinning(false);

      setTimeout(() => {
        setFlashIndex(null);
        setResult("");
        setWon(0);
        setRotation(0);
        setStake("");
      }, 2000);

    }, 4000);
  };

  return (
    <div style={{ textAlign: "center", paddingTop: 120 }}>

      {/* 🎯 DYNAMIC RETURNS */}
      <div style={{
        position: "fixed",
        top: 10,
        left: 10,
        background: "#000",
        color: "gold",
        padding: 10,
        borderRadius: 10,
        border: "1px solid gold",
        fontWeight: "bold"
      }}>
        🎯 RETURNS

        {!amount ? (
          <div style={{ color: "#ccc" }}>Enter stake</div>
        ) : (
          <>
            <div>x1 → ₦{amount}</div>
            <div>x2 → ₦{amount * 2}</div>
            <div>x3 → ₦{amount * 3}</div>
            <div>x10 → ₦{amount * 10}</div>
            <div>💎 → ₦{amount * 30}</div>
            <div>🎁 FREE → ₦{amount}</div>

            <hr />

            <div>📊 Avg → ₦{expectedValue.toFixed(0)}</div>
            <div>✅ Win: {winChance}%</div>
            <div>❌ Lose: {loseChance}%</div>
          </>
        )}
      </div>

      {/* rest unchanged UI */}

      <h3>💰 ₦{wallet?.balance || 0}</h3>

      <input
        type="number"
        placeholder="Min ₦50"
        value={stake}
        onChange={e => setStake(e.target.value)}
      />

      <p style={{ color: "red", fontWeight: "bold" }}>
        Stake: ₦{stake || 0}
      </p>

      <div style={{ position: "relative", width: 300, margin: "20px auto" }}>
        <div style={{
          position: "absolute",
          top: -5,
          left: "50%",
          transform: "translateX(-50%)",
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderBottom: "24px solid gold",
          zIndex: 10
        }} />

        <div style={{
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: gradient,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4s cubic-bezier(0.1,0.7,0.2,1)" : "none",
          boxShadow: glow ? "0 0 30px gold" : ""
        }}>
          {segments.map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `
                rotate(${i * segmentAngle}deg)
                translate(0,-140px)
                rotate(-${i * segmentAngle}deg)
              `,
              color: flashIndex === i ? "gold" : "#fff",
              fontWeight: "bold"
            }}>
              {s.label}
            </div>
          ))}
        </div>
      </div>

      <button onClick={spin} disabled={spinning}>
        {spinning ? "Spinning..." : "Spin"}
      </button>

      <h3>{result}</h3>
      {won > 0 && <h2 style={{ color: "gold" }}>₦{won}</h2>}

      {flowers.map(f => (
        <div key={f.id} style={{
          position: "fixed",
          top: "-10px",
          left: `${f.left}%`,
          animation: "fall 3s linear"
        }}>🌸</div>
      ))}

    </div>
  );
}