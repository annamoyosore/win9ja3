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

// 🔥 ADMIN WALLET
const ADMIN_WALLET_ID = "69f2482600125d496354";

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
  const [glow, setGlow] = useState(false);

  const timeoutRef = useRef(null);
  const spinDataRef = useRef(null);

  const segments = [
    { label: "LOSE", type: "LOSE", color: "#ef4444" },
    { label: "x2", type: "X2", color: "#22c55e" },
    { label: "FREE", type: "FREE", color: "#3b82f6" },
    { label: "x3", type: "X3", color: "#a855f7" },
    { label: "LOSE", type: "LOSE2", color: "#ef4444" },
    { label: "x1", type: "X1", color: "#f59e0b" },
    { label: "😬", type: "ALMOST", color: "#fb923c" },
    { label: "💎30", type: "JACKPOT", color: "#eab308" }
  ];

  const segmentAngle = 360 / segments.length;

  const gradient = `conic-gradient(from -90deg, ${segments
    .map((s, i) =>
      `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`
    )
    .join(",")})`;

  const amount = Number(stake) || 0;

  useEffect(() => {
    loadWallet();

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
      const amt = Math.floor(Math.random() * 50000) + 2000;

      const id = Date.now();

      setFeed(prev => [...prev, {
        id,
        msg: `💰 ${name} from ${city} won ₦${amt}`
      }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 3500);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  async function loadWallet() {
    const u = await account.get();

    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (res.documents.length) {
      setWallet(res.documents[0]);
    }
  }

  // 🎯 ODDS
  const getResult = () => {
    const r = Math.random();

    if (r < 0.45) return "LOSE";
    if (r < 0.65) return "LOSE2";
    if (r < 0.78) return "ALMOST"; // 13%
    if (r < 0.86) return "FREE";
    if (r < 0.96) return "X1";
    if (r < 0.98) return "X2";     // 2%
    return "X3";
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

    const bet = Number(stake);
    if (!bet || bet < 50) return;
    if (wallet.balance < bet) return;

    setSpinning(true);
    setGlow(true);

    const deducted = wallet.balance - bet;

    // 💸 USER DEDUCT
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: deducted }
    );

    setWallet(prev => ({ ...prev, balance: deducted }));

    // 💰 ADMIN PROFIT
    try {
      const admin = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID
      );

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID,
        {
          casinoProfit: (admin.casinoProfit || 0) + bet
        }
      );
    } catch {}

    const outcome = getResult();
    const index = segments.findIndex(s => s.type === outcome);

    const centerAngle = index * segmentAngle + segmentAngle / 2;
    const finalAngle = 360 * 5 + (360 - centerAngle + 90);

    spinDataRef.current = { outcome, bet, deducted, index };

    setRotation(finalAngle);

    timeoutRef.current = setTimeout(finishSpin, 4000);
  };

  const finishSpin = async () => {
    const data = spinDataRef.current;
    if (!data) return;

    const { outcome, bet, deducted, index } = data;

    let win = 0;
    const mult = { X1: 1, X2: 2, X3: 3 }[outcome];

    const admin = await databases.getDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      ADMIN_WALLET_ID
    );

    if (outcome === "FREE") {
      win = bet;
      setResult("🎁 FREE SPIN");

    } else if (outcome === "ALMOST") {
      setResult("😬 ALMOST");

    } else if (mult) {
      win = bet * mult;

      if ((admin.casinoReserve || 0) < win) {
        setResult("❌ CASINO LOW FUNDS");
        setSpinning(false);
        return;
      }

      setResult(`🎉 YOU WON ₦${win}`);
      setWon(win);
      spawnFlowers();

    } else {
      setResult("❌ YOU LOST");
    }

    // 💸 PAY FROM RESERVE
    if (win > 0) {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID,
        {
          casinoReserve: (admin.casinoReserve || 0) - win
        }
      );
    }

    const finalBalance = deducted + win;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: finalBalance }
    );

    setWallet(prev => ({ ...prev, balance: finalBalance }));

    // 📊 SAVE HISTORY (ALWAYS)
    try {
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
    } catch {}

    setSpinning(false);
    setGlow(false);

    setTimeout(() => {
      setRotation(0);
      setResult("");
      setWon(0);
      setStake("");
    }, 2500);
  };

  return (
    <div style={{ textAlign: "center", paddingTop: 120 }}>

      {/* RETURNS */}
      <div style={{
        position: "fixed",
        top: 10,
        left: 10,
        background: "#000",
        color: "gold",
        padding: 10,
        borderRadius: 10,
        border: "1px solid gold",
        width: 180
      }}>
        🎯 RETURNS
        <div>x1 → ₦{amount}</div>
        <div>x2 → ₦{amount * 2}</div>
        <div>x3 → ₦{amount * 3}</div>

        <div style={{ marginTop: 6, fontWeight: "bold" }}>
          💎 JACKPOT → ₦100,000
        </div>

        <div style={{
          marginTop: 6,
          fontSize: 11,
          color: "#ff4d4d",
          borderTop: "1px solid #333",
          paddingTop: 5,
          fontWeight: "bold"
        }}>
          ☠️ JACKPOT: VERY LOW CHANCE
        </div>
      </div>

      {/* FEED */}
      <div style={{ position: "fixed", top: 10, right: 10 }}>
        {feed.map(f => (
          <div key={f.id} style={{
            background: "#000",
            color: "gold",
            padding: 6,
            margin: 4,
            borderRadius: 6
          }}>
            {f.msg}
          </div>
        ))}
      </div>

      <h3>💰 ₦{wallet?.balance || 0}</h3>

      <input
        type="number"
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="Min ₦50"
      />

      {/* WHEEL */}
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
          transition: "transform 4s ease-out",
          boxShadow: glow ? "0 0 25px gold" : ""
        }}>
          {segments.map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `rotate(${i * segmentAngle}deg) translate(0,-140px) rotate(-${i * segmentAngle}deg)`,
              fontWeight: "bold"
            }}>
              {s.label}
            </div>
          ))}
        </div>
      </div>

      <button onClick={spin} disabled={spinning}>
        {spinning ? "SPINNING..." : "SPIN"}
      </button>

      <h2>{result}</h2>
      {won > 0 && <h3>₦{won}</h3>}

      {flowers.map(f => (
        <div key={f.id} style={{
          position: "fixed",
          top: "-10px",
          left: `${f.left}%`,
          animation: "fall 3s linear"
        }}>
          🌸
        </div>
      ))}

    </div>
  );
}