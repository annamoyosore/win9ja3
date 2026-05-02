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

const APP_VERSION = "1.1.2";

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

  // 🎯 PROBABILITY POOL
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

    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes fall {
        to { transform: translateY(110vh) rotate(360deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

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

    }, 5000);

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
      console.error("Wallet load error:", err);
    }
  }

  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.w;
      if (r <= sum) return p.type;
    }
    return "LOSE";
  };

  function spawnFlowers() {
    const items = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 3000);
  }

  // =========================
  // 🎡 SPIN
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
    const spins = 5 * 360;

    setRotation(prev => (prev % 360) + spins + finalAngle);

    setTimeout(async () => {
      try {
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

        } else if (outcome === "X2") {
          win = amount * 2;
          newBalance += win;
          status = "win";
          setResult("🎉 x2 Win");

        } else if (outcome === "X3") {
          win = amount * 3;
          newBalance += win;
          status = "win";
          setResult("🔥 x3 Win");

        } else if (outcome === "X10") {
          win = amount * 10;
          newBalance += win;
          status = "big";
          setResult("🚀 x10 BIG WIN");

        } else if (outcome === "JACKPOT") {
          win = amount * 30;
          newBalance += win;
          status = "jackpot";
          setResult("💎 JACKPOT x30!");
          spawnFlowers();

        } else {
          setResult("❌ You Lost");
        }

        setWon(win);

        // ✅ UPDATE WALLET
        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          wallet.$id,
          { balance: newBalance }
        );

        // ✅ SAVE GAME
        await databases.createDocument(
          DATABASE_ID,
          CASINO_COLLECTION,
          ID.unique(),
          {
            userId: wallet.userId,
            stake: amount,
            win,
            result: outcome,
            status,
            createdAt: new Date().toISOString()
          }
        );

        // refresh wallet
        setWallet(prev => ({ ...prev, balance: newBalance }));

      } catch (err) {
        console.error("Spin error:", err);
        setResult("Error processing spin");
      }

      setSpinning(false);
    }, 4500);
  };

  return (
    <div style={{ textAlign: "center", padding: 20 }}>
      <h2>🎡 Casino Wheel</h2>

      <div
        style={{
          width: 250,
          height: 250,
          borderRadius: "50%",
          margin: "20px auto",
          background: gradient,
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? "transform 4.5s cubic-bezier(0.1, 0.7, 0.1, 1)"
            : "none"
        }}
      />

      <input
        type="number"
        placeholder="Enter stake"
        value={stake}
        onChange={e => setStake(e.target.value)}
        style={{ padding: 10, marginBottom: 10 }}
      />

      <br />

      <button onClick={spin} disabled={spinning}>
        {spinning ? "Spinning..." : "Spin"}
      </button>

      <p>{result}</p>
      {won > 0 && <h3>Won: ₦{won}</h3>}

      <p>Balance: ₦{wallet?.balance || 0}</p>

      {/* LIVE FEED */}
      <div style={{ position: "fixed", top: 10, right: 10 }}>
        {feed.map(f => (
          <div key={f.id} style={{ background: "#000", color: "#fff", margin: 5, padding: 5 }}>
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
            fontSize: 20,
            animation: "fall 3s linear"
          }}
        >
          🌸
        </div>
      ))}
    </div>
  );
}