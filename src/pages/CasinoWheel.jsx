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

export default function CasinoWheel() {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [glow, setGlow] = useState(false);
  const [flashIndex, setFlashIndex] = useState(null);
  const [error, setError] = useState("");

  // 🎯 LOCKED SEGMENTS (color = meaning)
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

  // 🎯 PROBABILITY
  const getResult = () => {
    const r = Math.random();

    if (r < 0.335) return "LOSE";
    if (r < 0.475) return "LOSE2";
    if (r < 0.545) return "FREE";
    if (r < 0.745) return "X1";
    if (r < 0.945) return "X2";
    if (r < 0.985) return "X3";
    if (r < 0.995) return "X10";
    return "JACKPOT";
  };

  // 🔊 SOUND
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
      osc.stop(ctx.currentTime + 0.02);
    } catch {}
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
    setGlow(true);

    let ticks = 0;
    const sound = setInterval(() => {
      tick();
      ticks++;
      if (ticks > 40) clearInterval(sound);
    }, 60);

    const deducted = wallet.balance - bet;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: deducted }
    );

    setWallet(prev => ({ ...prev, balance: deducted }));

    const outcome = getResult();
    const index = segments.findIndex(s => s.type === outcome);

    // 🎯 PERFECT POINTER FIX
    const centerAngle = index * segmentAngle + segmentAngle / 2;
    const finalAngle = 360 * 5 + (360 - centerAngle - 90);

    setRotation(finalAngle);

    setTimeout(async () => {

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

  const amount = Number(stake) || 0;

  return (
    <div style={{ textAlign: "center", paddingTop: 140 }}>

      {/* 🔴 ERROR POPUP */}
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
          fontWeight: "bold",
          zIndex: 1000
        }}>
          {error}
        </div>
      )}

      {/* 🎯 RETURNS */}
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
        {amount ? (
          <>
            <div>x1 → ₦{amount}</div>
            <div>x2 → ₦{amount * 2}</div>
            <div>x3 → ₦{amount * 3}</div>
            <div>x10 → ₦{amount * 10}</div>
            <div>💎 → ₦{amount * 30}</div>
          </>
        ) : "Enter stake"}
      </div>

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
          transition: spinning ? "transform 4s cubic-bezier(0.1,0.7,0.2,1)" : "none",
          boxShadow: glow ? "0 0 30px gold" : ""
        }}>
          {segments.map((s, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 60,
              marginLeft: -30,
              textAlign: "center",
              transform: `
                rotate(${i * segmentAngle + segmentAngle / 2}deg)
                translate(0, -110px)
                rotate(-${i * segmentAngle + segmentAngle / 2}deg)
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

    </div>
  );
}