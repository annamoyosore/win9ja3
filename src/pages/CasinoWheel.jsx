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

const names = [
  "Emeka","Tunde","Chioma","Ibrahim","Mary","David","Zainab",
  "Ayo","Blessing","Samuel","Fatima","Uche","Sadiq","Grace",
  "Daniel","Hassan","Ngozi","Yusuf","Ada","Kelvin"
];

const cities = ["Lagos","Abuja","Ibadan","Kano","Enugu"];

export default function CasinoWheel() {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [feed, setFeed] = useState([]);
  const [error, setError] = useState("");

  const segments = [
    { label: "LOSE", type: "LOSE", color: "#ef4444", weight: 35 },
    { label: "x2", type: "X2", color: "#3b82f6", weight: 18 },
    { label: "FREE", type: "FREE", color: "#06b6d4", weight: 10 },
    { label: "x3", type: "X3", color: "#a855f7", weight: 3 },
    { label: "LOSE", type: "LOSE2", color: "#ef4444", weight: 15 },
    { label: "x1", type: "X1", color: "#f59e0b", weight: 18 },
    { label: "x10", type: "X10", color: "#f97316", weight: 1 },
    { label: "💎30", type: "JACKPOT", color: "#eab308", weight: 0 }
  ];

  const segmentAngle = 360 / segments.length;

  const gradient = `conic-gradient(from -90deg, ${segments
    .map((s, i) => `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`)
    .join(",")})`;

  // 🎯 Weighted picker
  const pickWeightedIndex = () => {
    const total = segments.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;

    for (let i = 0; i < segments.length; i++) {
      if (r < segments[i].weight) return i;
      r -= segments[i].weight;
    }
    return 0;
  };

  useEffect(() => {
    loadWallet();

    // 🏆 RANDOM WIN POPUPS (max 20)
    const interval = setInterval(() => {
      const id = Date.now();
      const name = names[Math.floor(Math.random() * names.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const amount = Math.floor(Math.random() * 50000) + 2000;

      setFeed(prev => {
        const updated = [...prev, {
          id,
          msg: `🏆 ${name} from ${city} won ₦${amount}`
        }];
        return updated.slice(-20); // keep max 20
      });

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 3500);

    }, 3000);

    return () => clearInterval(interval);
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

  const spin = async () => {
    if (spinning || !wallet) return;

    const bet = Number(stake);

    if (!bet || bet < 50) {
      setError("Minimum stake is ₦50");
      return;
    }

    if (wallet.balance < bet) {
      setError("Insufficient balance");
      return;
    }

    setError("");
    setSpinning(true);

    const deducted = wallet.balance - bet;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: deducted }
    );

    setWallet(prev => ({ ...prev, balance: deducted }));

    const index = pickWeightedIndex();

    const centerAngle = (index + 0.5) * segmentAngle;
    const finalAngle = 360 * 5 + (360 - centerAngle);

    setRotation(prev => prev + finalAngle);

    setTimeout(async () => {

      const outcome = segments[index].type;

      let win = 0;
      const mult = { X1:1, X2:2, X3:3, X10:10, JACKPOT:30 }[outcome];

      if (outcome === "FREE") {
        win = bet;
        setResult("🎁 FREE SPIN");
      } else if (mult) {
        win = bet * mult;
        setResult(`🎉 WON ₦${win}`);
        setWon(win);
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

      setSpinning(false);

    }, 4000);
  };

  const amount = Number(stake) || 0;

  return (
    <div style={{ textAlign: "center", paddingTop: 120 }}>

      {/* ERROR POPUP */}
      {error && (
        <div style={{
          position: "fixed",
          top: 80,
          left: "50%",
          transform: "translateX(-50%)",
          background: "red",
          color: "#fff",
          padding: 10,
          borderRadius: 8,
          fontWeight: "bold"
        }}>
          {error}
        </div>
      )}

      {/* 💰 DYNAMIC RETURNS */}
      {amount > 0 && (
        <div style={{
          position: "fixed",
          top: 10,
          left: 10,
          background: "#000",
          color: "gold",
          padding: 10,
          borderRadius: 10,
          border: "1px solid gold"
        }}>
          <div>🎯 Estimated Returns</div>
          <div>x1 → ₦{amount}</div>
          <div>x2 → ₦{amount * 2}</div>
          <div>x3 → ₦{amount * 3}</div>
          <div>x10 → ₦{amount * 10}</div>
          <div>💎 → ₦{amount * 30}</div>
        </div>
      )}

      {/* 🏆 FEED */}
      <div style={{ position: "fixed", top: 10, right: 10 }}>
        {feed.map(f => (
          <div key={f.id} style={{
            background: "#000",
            color: "gold",
            padding: 8,
            margin: 4,
            borderRadius: 6,
            border: "1px solid gold"
          }}>
            {f.msg}
          </div>
        ))}
      </div>

      <h3>💰 ₦{wallet?.balance || 0}</h3>

      <input
        type="number"
        placeholder="Min ₦50"
        value={stake}
        onChange={e => setStake(e.target.value)}
      />

      <div style={{ position: "relative", width: 300, margin: "20px auto" }}>

        {/* POINTER */}
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

        {/* WHEEL */}
        <div style={{
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: gradient,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4s ease-out" : "none"
        }}>
          {segments.map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 70,
              marginLeft: -35,
              textAlign: "center",
              transform: `
                rotate(${(i + 0.5) * segmentAngle}deg)
                translateY(-95px)
                rotate(-${(i + 0.5) * segmentAngle}deg)
              `,
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

    </div>
  );
}