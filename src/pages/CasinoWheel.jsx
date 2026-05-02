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

const names = ["Emeka","Tunde","Chioma","Ibrahim","Mary","David","Zainab"];
const cities = ["Lagos","Abuja","Ibadan","Kano","Enugu"];

export default function CasinoWheel() {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [feed, setFeed] = useState([]);
  const [flowers, setFlowers] = useState([]);

  const segments = [
    { label: "❌", type: "LOSE", color: "#ef4444" },
    { label: "x2", type: "X2", color: "#22c55e" },
    { label: "🎁", type: "FREE", color: "#3b82f6" },
    { label: "x3", type: "X3", color: "#a855f7" },
    { label: "❌", type: "LOSE2", color: "#ef4444" },
    { label: "x1", type: "X1", color: "#f59e0b" },
    { label: "x10", type: "X10", color: "#f97316" },
    { label: "💎30", type: "JACKPOT", color: "#eab308" }
  ];

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

  const segmentAngle = 360 / segments.length;

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

      const msg = `💰 ${name} from ${city} won ₦${amount}`;
      const id = Date.now();

      setFeed(prev => [...prev, { id, msg }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 3500);

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

  const getResult = () => {
    const r = Math.random();
    if (r < 0.60) return "LOSE";
    if (r < 0.75) return "LOSE2";
    if (r < 0.85) return "FREE";
    if (r < 0.95) return "X1";
    if (r < 0.975) return "X2";
    if (r < 0.985) return "X3";
    if (r < 0.998) return "X10";
    return "JACKPOT";
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
  // SPIN
  // =========================
  const spin = async () => {
    if (spinning || !wallet) return;

    const amount = Number(stake);
    if (!amount || amount < 50) return setResult("Minimum ₦50");
    if (wallet.balance < amount) return setResult("No balance");

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();
    const index = map[outcome];

    const target = index * segmentAngle + segmentAngle / 2;
    const final = (360 - target) % 360;

    setRotation(prev => (prev % 360) + 360 * 5 + final);

    setTimeout(async () => {
      try {
        let newBalance = wallet.balance - amount;
        let win = 0;

        if (outcome === "FREE") {
          newBalance += amount;
          setResult("🎁 FREE SPIN");

        } else if (outcome === "X1") {
          newBalance += amount;
          setResult("⚖️ RETURNED");

        } else {
          const mult = { X2: 2, X3: 3, X10: 10, JACKPOT: 30 }[outcome];

          if (mult) {
            win = amount * mult;
            newBalance += win;
            setResult(`🎉 WON ₦${win}`);
            setWon(win);

            if (mult >= 10) spawnFlowers();
          } else {
            setResult("❌ LOST");
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

        setWallet(prev => ({ ...prev, balance: newBalance });

      } catch (err) {
        console.error("Spin error:", err);
        setResult("Error occurred");
      }

      setSpinning(false);
    }, 4000);
  };

  return (
    <div style={{ textAlign: "center", padding: 20 }}>

      {/* RETURNS TOP LEFT */}
      <div style={{
        position: "fixed",
        top: 10,
        left: 10,
        background: "#000",
        color: "gold",
        padding: 12,
        borderRadius: 10,
        border: "1px solid gold",
        fontWeight: "bold",
        zIndex: 999
      }}>
        🎯 RETURNS
        <div>x1 → stake</div>
        <div>x2 → double</div>
        <div>x3 → triple</div>
        <div>x10 → big</div>
        <div>💎 x30 → jackpot</div>
      </div>

      {/* LIVE FEED TOP RIGHT */}
      <div style={{ position: "fixed", top: 10, right: 10 }}>
        {feed.map(f => (
          <div key={f.id} style={{
            background: "#000",
            color: "gold",
            fontWeight: "bold",
            padding: 8,
            margin: 4,
            border: "1px solid gold",
            borderRadius: 6
          }}>
            {f.msg}
          </div>
        ))}
      </div>

      <h2>🎡 Casino Wheel</h2>

      {/* POINTER + WHEEL */}
      <div style={{ position: "relative", width: 300, margin: "0 auto" }}>

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

        <div
          style={{
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 4s cubic-bezier(0.2,0.8,0.2,1)"
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
                transform: `rotate(${i * segmentAngle}deg) translate(0,-120px) rotate(-${i * segmentAngle}deg)`,
                fontSize: 13,
                fontWeight: "bold",
                color: "#fff"
              }}
            >
              {s.label}
            </div>
          ))}
        </div>
      </div>

      <input
        type="number"
        placeholder="Stake"
        value={stake}
        onChange={e => setStake(e.target.value)}
      />

      <p style={{ color: "red", fontWeight: "bold" }}>
        Stake: ₦{stake || 0}
      </p>

      <button onClick={spin} disabled={spinning}>
        {spinning ? "Spinning..." : "Spin"}
      </button>

      <h3>{result}</h3>
      {won > 0 && <h2 style={{ color: "gold" }}>₦{won}</h2>}

      <h4>Balance: ₦{wallet?.balance || 0}</h4>

      {/* FLOWERS */}
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