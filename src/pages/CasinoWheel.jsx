import { useState, useRef, useEffect } from "react";
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  CASINO_COLLECTION,
  account,
  Query,
  ID
} from "../lib/appwrite";

export default function CasinoWheel({ goBack }) {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [feed, setFeed] = useState([]);
  const [popup, setPopup] = useState(null);

  const tickerRef = useRef(null);

  // =========================
  // LOAD WALLET
  // =========================
  useEffect(() => {
    (async () => {
      const u = await account.get();
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );
      if (res.documents.length) setWallet(res.documents[0]);
    })();
  }, []);

  // =========================
  // SEGMENTS WITH REAL %
  // =========================
  const segments = [
    { label: "❌ LOSE", type: "LOSE", color: "#ef4444", w: 0.39 },
    { label: "❌ LOSE", type: "LOSE2", color: "#ef4444", w: 0.05 },
    { label: "x1", type: "X1", color: "#f59e0b", w: 0.1 },
    { label: "🎁 FREE", type: "FREE", color: "#3b82f6", w: 0.24 },
    { label: "x2", type: "X2", color: "#22c55e", w: 0.18 },
    { label: "x3", type: "X3", color: "#a855f7", w: 0.03 },
    { label: "🔥 x10", type: "X10", color: "#f97316", w: 0.009 },
    { label: "💎 ×30", type: "JACKPOT", color: "#eab308", w: 0.001 }
  ];

  // =========================
  // BUILD ANGLES
  // =========================
  let cumulative = 0;
  const slices = segments.map(seg => {
    const start = cumulative;
    const angle = seg.w * 360;
    cumulative += angle;
    return { ...seg, start, angle };
  });

  // =========================
  // GRADIENT
  // =========================
  const gradient = `conic-gradient(${slices.map(s =>
    `${s.color} ${s.start}deg ${s.start + s.angle}deg`
  ).join(",")})`;

  // =========================
  // RESULT ENGINE
  // =========================
  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let s of segments) {
      sum += s.w;
      if (r <= sum) return s.type;
    }
  };

  // =========================
  // SPIN
  // =========================
  const spin = async () => {
    if (spinning || !wallet) return;

    const amount = Number(stake);

    if (!amount || amount < 50) {
      setResult("Min ₦50");
      return;
    }

    if (wallet.balance < amount) {
      setResult("❌ Insufficient balance");
      return;
    }

    setSpinning(true);
    setWon(0);
    setResult("");

    const outcome = getResult();
    const slice = slices.find(s => s.type === outcome);

    const target = slice.start + slice.angle / 2;
    const stop = 360 - target;

    const duration = 4500;

    setRotation(prev => prev % 360 + 1800 + stop);

    setTimeout(async () => {

      let newBalance = wallet.balance - amount;
      let win = 0;

      if (outcome === "FREE" || outcome === "X1") {
        newBalance += amount;
      } else if (!(outcome === "LOSE" || outcome === "LOSE2")) {
        const mult = outcome === "JACKPOT" ? 30 : parseInt(outcome.replace("X",""));
        win = amount * mult;
        newBalance += win;

        setWon(win);
        setPopup("win");

        setFeed(prev => [
          ...prev,
          { id: Date.now(), msg: `🎉 You won ₦${win}` }
        ]);
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: newBalance }
      );

      const user = await account.get();
      await databases.createDocument(
        DATABASE_ID,
        CASINO_COLLECTION,
        ID.unique(),
        {
          userId: user.$id,
          outcome,
          stake: amount,
          winAmount: win,
          balanceAfter: newBalance
        }
      );

      setWallet(prev => ({ ...prev, balance: newBalance }));
      setResult(win > 0 ? `🎉 ₦${win}` : "❌ Lose");
      setSpinning(false);

    }, duration);
  };

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>

      <h3>💰 ₦{wallet?.balance || 0}</h3>

      <input
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="₦50+"
      />

      <div style={{ fontSize: 24 }}>🔻</div>

      {/* 🎡 WHEEL */}
      <div style={{
        width: 260,
        height: 260,
        margin: "20px auto",
        borderRadius: "50%",
        background: gradient,
        position: "relative",
        transform: `rotate(${rotation}deg)`,
        transition: "transform 4.5s cubic-bezier(.17,.67,.83,.67)"
      }}>
        {slices.map((s, i) => {
          const mid = s.start + s.angle / 2;
          return (
            <div key={i} style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `
                rotate(${mid}deg)
                translate(0, -90px)
                rotate(-${mid}deg)
              `,
              fontWeight: "900",
              fontSize: 10,
              color: "#fff",
              textAlign: "center"
            }}>
              {s.label}
            </div>
          );
        })}
      </div>

      <button onClick={spin}>
        {spinning ? "Spinning..." : "SPIN"}
      </button>

      <h3>{result}</h3>
      <h2>₦{won}</h2>

      {popup === "win" && (
        <div style={{
          position: "fixed",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#000",
          padding: 20,
          borderRadius: 10
        }}>
          🎉 ₦{won}
        </div>
      )}

    </div>
  );
}