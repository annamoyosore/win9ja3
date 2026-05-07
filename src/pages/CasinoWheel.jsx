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

const ADMIN_WALLET_ID = "69f2482600125d496354";

export default function CasinoWheel() {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [spinning, setSpinning] = useState(false);

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
  const amount = Number(stake) || 0;

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

    if (res.documents.length) {
      setWallet(res.documents[0]);
    }
  }

  // 🎯 ODDS
  const getResult = () => {
    const r = Math.random();

    if (r < 0.45) return "LOSE";
    if (r < 0.65) return "LOSE2";
    if (r < 0.78) return "ALMOST";
    if (r < 0.86) return "FREE";
    if (r < 0.96) return "X1";
    if (r < 0.98) return "X2";
    return "X3";
  };

  const spin = async () => {
    if (spinning || !wallet) return;

    const bet = Number(stake);
    if (!bet || bet < 50) return;
    if (wallet.balance < bet) return;

    setSpinning(true);

    try {

      // =========================
      // 1. DEDUCT PLAYER STAKE
      // =========================
      const deducted = wallet.balance - bet;

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: deducted }
      );

      setWallet(prev => ({ ...prev, balance: deducted }));

      // =========================
      // 2. ADD TO CASINO PROFIT
      // =========================
      const adminWallet = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID
      );

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID,
        {
          casinoProfit: (adminWallet.casinoProfit || 0) + bet
        }
      );

      // =========================
      // 3. DETERMINE RESULT
      // =========================
      const outcome = getResult();
      const index = segments.findIndex(s => s.type === outcome);

      const centerAngle = index * segmentAngle + segmentAngle / 2;
      const finalAngle = 360 * 5 + (360 - centerAngle + 90);

      spinDataRef.current = { outcome, bet, deducted, index };

      setRotation(finalAngle);

      timeoutRef.current = setTimeout(finishSpin, 3500);

    } catch (err) {
      console.log(err);
      setSpinning(false);
    }
  };

  const finishSpin = async () => {

    const data = spinDataRef.current;
    if (!data) return;

    const { outcome, bet, deducted } = data;

    let win = 0;

    const mult = { X1: 1, X2: 2, X3: 3 }[outcome];

    const adminWallet = await databases.getDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      ADMIN_WALLET_ID
    );

    // =========================
    // 4. RESULT LOGIC
    // =========================

    if (outcome === "FREE") {
      win = bet;
      setResult("🎁 FREE SPIN");

    } else if (outcome === "ALMOST") {
      setResult("😬 ALMOST!");

    } else if (mult) {

      win = bet * mult;

      // ❌ CHECK RESERVE
      if ((adminWallet.casinoReserve || 0) < win) {
        setResult("❌ CASINO OUT OF FUNDS");
        setSpinning(false);
        return;
      }

      // 💰 DEDUCT FROM RESERVE
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID,
        {
          casinoReserve: adminWallet.casinoReserve - win
        }
      );

      setResult(`🎉 YOU WON ₦${win}`);

    } else {
      setResult("❌ YOU LOST");
    }

    // =========================
    // 5. CREDIT PLAYER
    // =========================
    const finalBalance = deducted + win;

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      { balance: finalBalance }
    );

    setWallet(prev => ({ ...prev, balance: finalBalance }));

    // =========================
    // 6. SAVE GAME RECORD
    // =========================
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
    } catch (err) {
      console.log("CASINO LOG ERROR:", err);
    }

    setSpinning(false);

    setTimeout(() => {
      setRotation(0);
      setResult("");
      setStake("");
    }, 2500);
  };

  return (
    <div style={{ textAlign: "center", paddingTop: 120 }}>

      <h3>💰 ₦{wallet?.balance || 0}</h3>

      <input
        type="number"
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="Min ₦50"
      />

      {/* WHEEL */}
      <div style={{
        position: "relative",
        width: 300,
        margin: "40px auto"
      }}>

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
          background: `conic-gradient(from -90deg, ${segments.map((s, i) =>
            `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`
          ).join(",")})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4s ease-out" : "none"
        }} />

      </div>

      <button onClick={spin} disabled={spinning}>
        {spinning ? "SPINNING..." : "SPIN"}
      </button>

      <div style={{ marginTop: 20, fontSize: 28 }}>
        {result}
      </div>

    </div>
  );
}