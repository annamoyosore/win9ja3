import { useState, useRef, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

export default function CasinoWheel() {

  // =========================
  // STATE
  // =========================
  const [userId, setUserId] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [freeSpins, setFreeSpins] = useState(0);

  const audioCtxRef = useRef(null);

  // =========================
  // LOAD USER + WALLET
  // =========================
  useEffect(() => {
    loadWallet();
  }, []);

  async function loadWallet() {
    const u = await account.get();
    setUserId(u.$id);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (w.documents.length) {
      setWallet(w.documents[0]);
    }
  }

  // =========================
  // SEGMENTS
  // =========================
  const segments = [
    "❌ Lose",
    "x2",
    "🎁 Free",
    "x3",
    "➖ -50%",
    "x1",
    "🔥 x10",
    "💎 JACKPOT ×30"
  ];

  const segmentAngle = 360 / segments.length;

  // =========================
  // RESULT POOL
  // =========================
  const pool = [
    { type: "LOSE", weight: 0.39 },
    { type: "HALF", weight: 0.12 },
    { type: "X1", weight: 0.12 },
    { type: "FREE", weight: 0.08 },
    { type: "X2", weight: 0.20 },
    { type: "X3", weight: 0.08 },
    { type: "X10", weight: 0.01 }
  ];

  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.weight;
      if (r <= sum) return p.type;
    }
  };

  // =========================
  // SOUND
  // =========================
  const playSound = (type) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;

    const tone = (f, d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.value = 0.1;
      o.start();
      setTimeout(() => o.stop(), d);
    };

    if (type === "win") [400, 700, 1000].forEach((f, i) =>
      setTimeout(() => tone(f, 200), i * 120)
    );

    if (type === "lose") [500, 300, 120].forEach((f, i) =>
      setTimeout(() => tone(f, 200), i * 150)
    );
  };

  // =========================
  // SPIN LOGIC
  // =========================
  const spin = async () => {
    if (spinning) return;

    const numericStake = Number(stake);

    if ((!numericStake || numericStake <= 0) && freeSpins <= 0) {
      setResult("⚠️ Enter stake");
      return;
    }

    if (!wallet) return;

    if (freeSpins <= 0 && wallet.balance < numericStake) {
      setResult("❌ Insufficient balance");
      return;
    }

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();

    const map = {
      LOSE: 0,
      X2: 1,
      FREE: 2,
      X3: 3,
      HALF: 4,
      X1: 5,
      X10: 6
    };

    const index = map[outcome];
    const stopAngle = 360 - (index * segmentAngle + segmentAngle / 2);
    setRotation((prev) => prev + 1440 + stopAngle);

    setTimeout(async () => {

      let win = 0;
      let newBalance = wallet.balance;

      if (outcome === "LOSE") {
        if (freeSpins <= 0) newBalance -= numericStake;
        playSound("lose");
        setResult(`❌ Lost ₦${numericStake}`);

      } else if (outcome === "HALF") {
        const loss = numericStake / 2;
        if (freeSpins <= 0) newBalance -= loss;
        playSound("lose");
        setResult(`➖ Lost ₦${loss}`);

      } else if (outcome === "X1") {
        setResult("⚖️ No Gain");
        playSound("win");

      } else if (outcome === "FREE") {
        setFreeSpins((f) => f + 1);
        setResult("🎁 Free Spin!");
        playSound("win");

      } else {
        const mult = parseInt(outcome.replace("X", ""));
        win = numericStake * mult;

        if (freeSpins <= 0) newBalance -= numericStake;
        newBalance += win;

        setWon(win);
        playSound("win");
        setResult(`🎉 Won ₦${win}`);
      }

      // UPDATE WALLET
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      setWallet({ ...wallet, balance: newBalance });

      // SAVE GAME RECORD
      await databases.createDocument(
        DATABASE_ID,
        "casino_spins",
        ID.unique(),
        {
          userId,
          stake: numericStake,
          outcome,
          winAmount: win,
          balanceAfter: newBalance,
          createdAt: new Date().toISOString()
        }
      );

      setSpinning(false);

    }, 3000);
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ textAlign: "center", color: "#fff", padding: 20 }}>

      <h2>🎡 Casino Jackpot</h2>

      {/* WALLET */}
      <div style={{
        background: "#111",
        padding: 12,
        borderRadius: 10,
        marginBottom: 15
      }}>
        💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}

        <button onClick={loadWallet} style={{ marginLeft: 10 }}>
          🔄
        </button>
      </div>

      {/* STAKE */}
      <input
        type="number"
        placeholder="Stake"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        style={{ padding: 10, borderRadius: 8 }}
      />

      <p>🎟 Free Spins: {freeSpins}</p>

      {/* 🎡 REAL WHEEL */}
      <div style={{
        width: 220,
        height: 220,
        margin: "20px auto",
        borderRadius: "50%",
        border: "6px solid gold",
        position: "relative",
        transform: `rotate(${rotation}deg)`,
        transition: "transform 3s cubic-bezier(0.25,1,0.5,1)"
      }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: "50%",
              height: "50%",
              top: "50%",
              left: "50%",
              transformOrigin: "0% 0%",
              transform: `rotate(${i * segmentAngle}deg)`,
              background: `hsl(${i * 45},80%,50%)`,
              clipPath: "polygon(0% 0%, 100% 50%, 0% 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 8,
              fontSize: 12,
              fontWeight: "bold"
            }}
          >
            {seg}
          </div>
        ))}
      </div>

      {/* 🔥 BIG SPIN BUTTON */}
      <button
        onClick={spin}
        style={{
          padding: "18px 40px",
          fontSize: 20,
          fontWeight: "bold",
          background: "gold",
          border: "none",
          borderRadius: 12,
          marginTop: 10
        }}
      >
        {spinning ? "Spinning..." : "🎡 SPIN"}
      </button>

      <p style={{ marginTop: 10 }}>{result}</p>
      <p>🏆 Won: ₦{won}</p>

    </div>
  );
}