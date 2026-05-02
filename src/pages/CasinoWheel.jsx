import { useState, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  CASINO_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

const APP_VERSION = "1.2.0";

const names = ["Emeka","Tunde","Chioma","Ibrahim","Mary","David","Zainab"];
const cities = ["Lagos","Abuja","Ibadan","Kano","Enugu"];

export default function CasinoWheel({ goBack }) {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [feed, setFeed] = useState([]);
  const [flowers, setFlowers] = useState([]);

  // =========================
  // 🎯 PROBABILITY ENGINE
  // =========================
  const pool = [
    { type: "LOSE", w: 0.60 },
    { type: "LOSE2", w: 0.15 },
    { type: "FREE", w: 0.10 },
    { type: "X1", w: 0.10 },
    { type: "X2", w: 0.025 },
    { type: "X3", w: 0.01 },
    { type: "X10", w: 0.003 },
    { type: "JACKPOT", w: 0.002 }
  ];

  // =========================
  // 🎡 WHEEL CONFIG
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

  const gradient = `conic-gradient(${segments
    .map((s, i) => `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`)
    .join(",")})`;

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    loadWallet();

    const interval = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const amount = Math.floor(Math.random() * 50000) + 2000;

      const msg =
        Math.random() > 0.5
          ? `${name} from ${city} won ₦${amount}`
          : `${name} from ${city} withdrew ₦${amount}`;

      const id = Date.now();
      setFeed(prev => [...prev, { id, msg }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 4000);

    }, 4000);

    return () => clearInterval(interval);
  }, []);

  async function loadWallet() {
    try {
      const u = await account.get();
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );
      if (res.documents.length) setWallet(res.documents[0]);
    } catch (err) {
      console.error(err);
    }
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
    return "LOSE";
  };

  function spawnFlowers() {
    const items = Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 3000);
  }

  // =========================
  // 🎡 SPIN LOGIC
  // =========================
  const spin = async () => {
    if (spinning || !wallet) return;

    const amount = Number(stake);

    if (!amount || amount < 50) return setResult("Minimum ₦50");
    if (wallet.balance < amount) return setResult("Insufficient balance");

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();
    const index = map[outcome];

    const target = index * segmentAngle + segmentAngle / 2;
    const finalAngle = (360 - target + 90) % 360;

    setRotation(prev => (prev % 360) + (360 * 5) + finalAngle);

    setTimeout(async () => {
      let newBalance = wallet.balance - amount;
      let win = 0;
      let status = "lose";

      if (outcome === "FREE") {
        newBalance += amount;
        setResult("🎁 Free Spin");

      } else if (outcome === "X1") {
        newBalance += amount;
        setResult("⚖️ Stake Returned");

      } else {
        const mult = {
          X2: 2,
          X3: 3,
          X10: 10,
          JACKPOT: 30
        }[outcome];

        if (mult) {
          win = amount * mult;
          newBalance += win;
          setResult(`🎉 Won ₦${win}`);
          setWon(win);

          if (mult >= 10) spawnFlowers();
        } else {
          setResult("❌ You Lost");
        }
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      await databases.createDocument(
        DATABASE_ID,
        CASINO_COLLECTION,
        ID.unique(),
        {
          userId: wallet.userId,
          stake: amount,
          win,
          result: outcome,
          createdAt: new Date().toISOString()
        }
      );

      setWallet(prev => ({ ...prev, balance: newBalance }));
      setSpinning(false);

    }, 4500);
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ textAlign: "center", padding: 20 }}>

      <h2>🎡 Casino Wheel</h2>

      {/* POINTER */}
      <div style={{
        width: 0,
        height: 0,
        borderLeft: "15px solid transparent",
        borderRight: "15px solid transparent",
        borderBottom: "25px solid black",
        margin: "0 auto"
      }} />

      {/* WHEEL */}
      <div
        style={{
          width: 280,
          height: 280,
          borderRadius: "50%",
          margin: "10px auto",
          background: gradient,
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? "transform 4.5s cubic-bezier(0.1, 0.7, 0.1, 1)"
            : "none",
          position: "relative"
        }}
      >
        {segments.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `rotate(${i * segmentAngle}deg) translate(0, -120px) rotate(-${i * segmentAngle}deg)`,
              fontSize: 12,
              fontWeight: "bold",
              color: "#fff"
            }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* STAKE */}
      <input
        type="number"
        placeholder="Enter stake"
        value={stake}
        onChange={e => setStake(e.target.value)}
        style={{ padding: 10, marginTop: 10 }}
      />

      <p style={{ color: "red", fontWeight: "bold" }}>
        Stake: ₦{stake || 0}
      </p>

      <button onClick={spin} disabled={spinning}>
        {spinning ? "Spinning..." : "Spin"}
      </button>

      <h3>{result}</h3>
      {won > 0 && <h2 style={{ color: "green" }}>₦{won}</h2>}

      <h4>Balance: ₦{wallet?.balance || 0}</h4>

      {/* LIVE FEED */}
      <div style={{ position: "fixed", top: 10, right: 10 }}>
        {feed.map(f => (
          <div key={f.id} style={{ background: "#000", color: "#fff", padding: 6, margin: 4 }}>
            {f.msg}
          </div>
        ))}
      </div>

      {/* FLOWERS */}
      {flowers.map(f => (
        <div
          key={f.id}
          style={{
            position: "fixed",
            top: "-10px",
            left: `${f.left}%`,
            animation: "fall 3s linear"
          }}
        >
          🌸
        </div>
      ))}

    </div>
  );
}