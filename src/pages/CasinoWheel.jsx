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

  const gradient = `conic-gradient(${segments
    .map((s, i) => `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`)
    .join(",")})`;

  useEffect(() => {
    loadWallet();

    // animation
    if (!document.getElementById("fall-style")) {
      const style = document.createElement("style");
      style.id = "fall-style";
      style.innerHTML = `
        @keyframes fall {
          to { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    // popup feed
    const interval = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const amount = Math.floor(Math.random() * 50000) + 2000;

      const id = Date.now();
      setFeed(prev => [...prev, { id, msg: `💰 ${name} from ${city} won ₦${amount}` }]);

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
      console.error("LOAD WALLET ERROR:", err);
    }
  }

  // 🎯 UPDATED PROBABILITY
  const getResult = () => {
    const r = Math.random();

    if (r < 0.50) return "LOSE";
    if (r < 0.65) return "LOSE2";
    if (r < 0.75) return "FREE";
    if (r < 0.95) return "X1";
    if (r < 0.975) return "X2";
    if (r < 0.985) return "X3";
    if (r < 0.995) return "X10";
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

  const spin = async () => {
    if (spinning || !wallet) return;

    const amount = Number(stake);
    if (!amount || amount < 50) return setResult("Minimum ₦50");
    if (wallet.balance < amount) return setResult("No balance");

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();
    const index = segments.findIndex(s => s.type === outcome);

    const target = index * segmentAngle + segmentAngle / 2;
    const final = (360 - target) % 360;

    setRotation(prev => (prev % 360) + 360 * 5 + final);

    setTimeout(async () => {

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

      try {
        // ✅ wallet update MUST succeed
        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          wallet.$id,
          { balance: newBalance }
        );

        setWallet(prev => ({ ...prev, balance: newBalance }));

      } catch (err) {
        console.error("WALLET UPDATE ERROR:", err);
        setResult("Wallet error");
      }

      try {
        // ✅ logging (non-blocking)
        await databases.createDocument(
          DATABASE_ID,
          CASINO_COLLECTION,
          ID.unique(),
          {
            userId: wallet.userId || wallet.$id,
            stake: Number(amount),
            win: Number(win),
            result: String(outcome),
            createdAt: new Date().toISOString()
          }
        );
      } catch (err) {
        console.warn("LOGGING FAILED (ignored):", err);
      }

      setSpinning(false);

      setTimeout(() => {
        setResult("");
        setWon(0);
        setRotation(0);
        setStake("");
      }, 2000);

    }, 4000);
  };

  return (
    <div style={{ textAlign: "center", padding: 20, paddingTop: 120 }}>

      <div style={{
        position: "fixed",
        top: 10,
        left: 10,
        background: "#000",
        color: "gold",
        padding: 10,
        borderRadius: 10
      }}>
        🎯 RETURNS
        <div>x1 → stake</div>
        <div>x2 → double</div>
        <div>x3 → triple</div>
        <div>x10 → big</div>
        <div>💎 x30</div>
      </div>

      <div style={{ position: "fixed", top: 10, right: 10 }}>
        {feed.map(f => (
          <div key={f.id} style={{
            background: "#000",
            color: "gold",
            fontWeight: "bold",
            padding: 8,
            margin: 4,
            borderRadius: 6
          }}>
            {f.msg}
          </div>
        ))}
      </div>

      <h3>💰 Balance: ₦{wallet?.balance || 0}</h3>

      <input
        type="number"
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="Enter stake"
      />

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

        <div
          style={{
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4s ease-out" : "none",
            position: "relative"
          }}
        >
          {segments.map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `rotate(${i * segmentAngle}deg) translate(0,-110px) rotate(-${i * segmentAngle}deg)`,
              color: "#fff",
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