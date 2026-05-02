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
  const [error, setError] = useState("");

  const segments = [
    { label: "LOSE", type: "LOSE", color: "#ef4444" },
    { label: "x2", type: "X2", color: "#3b82f6" },
    { label: "FREE", type: "FREE", color: "#06b6d4" },
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

  useEffect(() => {
    loadWallet();

    const interval = setInterval(() => {
      const id = Date.now();
      const name = names[Math.floor(Math.random() * names.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const amount = Math.floor(Math.random() * 50000) + 2000;

      setFeed(prev => [...prev, {
        id,
        msg: `💰 ${name} from ${city} won ₦${amount}`
      }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 3000);

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
    if (res.documents.length) setWallet(res.documents[0]);
  }

  // 🎯 GET RESULT FROM POINTER POSITION
  const getIndexFromRotation = (rot) => {
    const normalized = ((rot % 360) + 360) % 360;
    const pointerAngle = (360 - normalized) % 360;
    return Math.floor(pointerAngle / segmentAngle);
  };

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

    // 🎯 RANDOM SPIN ONLY (no predefined outcome)
    const randomSpin = 360 * (5 + Math.random() * 3);

    setRotation(prev => prev + randomSpin);

    setTimeout(async () => {

      const index = getIndexFromRotation(rotation + randomSpin);
      const segment = segments[index];
      const outcome = segment.type;

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

      setTimeout(() => {
        setResult("");
        setWon(0);
        setStake("");
      }, 2000);

    }, 4000);
  };

  return (
    <div style={{ textAlign: "center", paddingTop: 120 }}>

      {error && <div style={{ color: "red" }}>{error}</div>}

      <h3>💰 ₦{wallet?.balance || 0}</h3>

      <input
        type="number"
        placeholder="Min ₦50"
        value={stake}
        onChange={e => setStake(e.target.value)}
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