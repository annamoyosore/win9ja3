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

export default function CasinoWheel() {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [glow, setGlow] = useState(false);
  const [flashIndex, setFlashIndex] = useState(null);

  const tickRef = useRef(null);

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

  // 🔊 Tick sound
  function tick() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.frequency.value = 700;
      gain.gain.value = 0.05;

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    } catch {}
  }

  useEffect(() => {
    loadWallet();
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

  const spin = async () => {
    if (spinning || !wallet) return;

    const amount = Number(stake);
    if (!amount || amount < 50) return;

    setSpinning(true);
    setGlow(true);

    // 🔊 tick loop
    let ticks = 0;
    const interval = setInterval(() => {
      tick();
      ticks++;
      if (ticks > 40) clearInterval(interval);
    }, 60);

    // 💸 instant deduction
    let deducted = wallet.balance - amount;

    try {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: deducted }
      );
      setWallet(prev => ({ ...prev, balance: deducted }));
    } catch (err) {
      console.error(err);
      setSpinning(false);
      return;
    }

    const outcome = getResult();
    const index = segments.findIndex(s => s.type === outcome);

    const pointerOffset = 90;
    const target = index * segmentAngle + segmentAngle / 2;
    const final = (360 - target + pointerOffset) % 360;

    setRotation(prev => (prev % 360) + 360 * 5 + final);

    setTimeout(async () => {

      let win = 0;

      const mult = {
        X1: 1,
        X2: 2,
        X3: 3,
        X10: 10,
        JACKPOT: 30
      }[outcome];

      if (outcome === "FREE") {
        win = amount;
        setResult("🎁 FREE SPIN");
      } else if (mult) {
        win = amount * mult;
        setResult(`🎉 WON ₦${win}`);
        setWon(win);
      } else {
        setResult("❌ LOST");
      }

      const finalBalance = deducted + win;

      // 💰 update wallet
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: finalBalance }
      );

      setWallet(prev => ({ ...prev, balance: finalBalance }));

      // 🧾 SAFE LOGGING (feeds history)
      try {
        await databases.createDocument(
          DATABASE_ID,
          CASINO_COLLECTION,
          ID.unique(),
          {
            userId: wallet.userId || wallet.$id,
            stake: amount,
            win,
            result: outcome,
            balanceAfter: finalBalance,
            createdAt: new Date().toISOString()
          }
        );
      } catch (err) {
        console.warn("Log failed:", err);
      }

      setFlashIndex(index);
      setGlow(false);
      setSpinning(false);

      setTimeout(() => {
        setFlashIndex(null);
        setResult("");
        setWon(0);
        setStake("");
        setRotation(0);
      }, 2000);

    }, 4000);
  };

  return (
    <div style={{ textAlign: "center", paddingTop: 120 }}>

      <h3>💰 ₦{wallet?.balance || 0}</h3>

      <input
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="Stake"
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
          transition: spinning ? "transform 4s ease-out" : "none",
          boxShadow: glow
            ? "0 0 30px gold, 0 0 60px orange"
            : "0 0 10px rgba(0,0,0,0.3)"
        }}>
          {segments.map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `
                rotate(${i * segmentAngle}deg)
                translate(0,-125px)
                rotate(-${i * segmentAngle}deg)
              `,
              color: flashIndex === i ? "gold" : "#fff",
              fontWeight: "bold",
              textShadow: flashIndex === i
                ? "0 0 10px gold"
                : "0 0 5px #000"
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