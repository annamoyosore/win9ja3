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

// 🔥 ADMIN CASINO WALLET
const ADMIN_WALLET_ID = "69f2482600125d496354";

const names = [
  "Emeka",
  "Tunde",
  "Chioma",
  "Ibrahim",
  "Mary",
  "David",
  "Zainab"
];

const cities = [
  "Lagos",
  "Abuja",
  "Ibadan",
  "Kano",
  "Enugu"
];

export default function CasinoWheel() {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [feed, setFeed] = useState([]);
  const [flowers, setFlowers] = useState([]);
  const [glow, setGlow] = useState(false);
  const [flashIndex, setFlashIndex] = useState(null);

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

  const gradient = `conic-gradient(
    from -90deg,
    ${segments
      .map(
        (s, i) =>
          `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`
      )
      .join(",")}
  )`;

  const amount = Number(stake) || 0;

  useEffect(() => {

    loadWallet();

    const style = document.createElement("style");

    style.innerHTML = `
      @keyframes fall {
        to {
          transform: translateY(110vh) rotate(360deg);
          opacity: 0;
        }
      }
    `;

    document.head.appendChild(style);

    const interval = setInterval(() => {

      const name =
        names[Math.floor(Math.random() * names.length)];

      const city =
        cities[Math.floor(Math.random() * cities.length)];

      const amt =
        Math.floor(Math.random() * 50000) + 2000;

      const id = Date.now();

      setFeed(prev => [
        ...prev,
        {
          id,
          msg: `💰 ${name} from ${city} won ₦${amt}`
        }
      ]);

      setTimeout(() => {
        setFeed(prev =>
          prev.filter(f => f.id !== id)
        );
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

  // 🔥 UPDATED ODDS
  const getResult = () => {

    const r = Math.random();

    // 45%
    if (r < 0.45) {
      return "LOSE";
    }

    // 20%
    if (r < 0.65) {
      return "LOSE2";
    }

    // 13%
    if (r < 0.78) {
      return "ALMOST";
    }

    // 8%
    if (r < 0.86) {
      return "FREE";
    }

    // 10%
    if (r < 0.96) {
      return "X1";
    }

    // 2%
    if (r < 0.98) {
      return "X2";
    }

    // 2%
    return "X3";
  };

  function spawnFlowers() {

    const items = Array.from({ length: 25 }).map(
      (_, i) => ({
        id: i,
        left: Math.random() * 100
      })
    );

    setFlowers(items);

    setTimeout(() => {
      setFlowers([]);
    }, 3000);
  }

  const spin = async () => {

    if (spinning || !wallet) return;

    const bet = Number(stake);

    if (!bet || bet < 50) return;

    if (wallet.balance < bet) {
      setResult("❌ INSUFFICIENT BALANCE");
      return;
    }

    setSpinning(true);
    setCanStop(true);
    setGlow(true);

    try {

      // 🔥 DEDUCT PLAYER BALANCE
      const deducted = wallet.balance - bet;

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: deducted
        }
      );

      setWallet(prev => ({
        ...prev,
        balance: deducted
      }));

      // 🔥 ADD STAKE TO ADMIN RESERVE
      try {

        const adminWallet =
          await databases.getDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            ADMIN_WALLET_ID
          );

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ADMIN_WALLET_ID,
          {
            casinoReserve:
              (adminWallet.casinoReserve || 0) + bet
          }
        );

      } catch (err) {
        console.log(
          "Admin reserve update failed",
          err
        );
      }

      // 🎯 OUTCOME
      const outcome = getResult();

      let index = segments.findIndex(
        s => s.type === outcome
      );

      const jackpotIndex = segments.findIndex(
        s => s.type === "JACKPOT"
      );

      if (
        index === jackpotIndex ||
        index === -1
      ) {
        index = segments.findIndex(
          s => s.type === "LOSE"
        );
      }

      const centerAngle =
        index * segmentAngle +
        segmentAngle / 2;

      const pointerOffset = 90;

      const spins = 360 * 5;

      const finalAngle =
        spins +
        (360 - centerAngle + pointerOffset);

      spinDataRef.current = {
        outcome,
        bet,
        deducted,
        index
      };

      setRotation(finalAngle);

      timeoutRef.current = setTimeout(
        finishSpin,
        4000
      );

    } catch (err) {

      console.log(err);

      setResult("❌ SPIN FAILED");

      setSpinning(false);
      setCanStop(false);
      setGlow(false);
    }
  };

  const finishSpin = async () => {

    const data = spinDataRef.current;

    if (!data) return;

    const {
      outcome,
      bet,
      deducted,
      index
    } = data;

    let win = 0;

    const mult = {
      X1: 1,
      X2: 2,
      X3: 3
    }[outcome];

    try {

      let adminWallet = null;

      try {

        adminWallet =
          await databases.getDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            ADMIN_WALLET_ID
          );

      } catch {}

      // 🎁 RESULT LOGIC
      if (outcome === "FREE") {

        win = bet;

        setResult("🎁 FREE SPIN");

      } else if (outcome === "ALMOST") {

        setResult("😬 ALMOST! TRY AGAIN");

      } else if (mult) {

        win = bet * mult;

        // 🔥 CHECK RESERVE
        if (
          adminWallet &&
          (adminWallet.casinoReserve || 0) < win
        ) {

          setResult("❌ CASINO BUSY");

          setSpinning(false);
          setCanStop(false);
          setGlow(false);

          return;
        }

        setResult(`🎉 YOU WON ₦${win}`);

        setWon(win);

        if (win > bet) {
          spawnFlowers();
        }

      } else {

        setResult("❌ YOU LOST");

        // 🔥 TRACK PROFIT
        if (adminWallet) {

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            ADMIN_WALLET_ID,
            {
              casinoProfit:
                (adminWallet.casinoProfit || 0) + bet
            }
          );
        }
      }

      // 🔥 REMOVE PAYOUT FROM RESERVE
      if (win > 0 && adminWallet) {

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ADMIN_WALLET_ID,
          {
            casinoReserve:
              (adminWallet.casinoReserve || 0) - win
          }
        );
      }

      // 🔥 FINAL PLAYER BALANCE
      const finalBalance = deducted + win;

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: finalBalance
        }
      );

      setWallet(prev => ({
        ...prev,
        balance: finalBalance
      }));

      // 🔥 SAVE HISTORY
      try {

        await databases.createDocument(
          DATABASE_ID,
          CASINO_COLLECTION,
          ID.unique(),
          {
            userId:
              wallet.userId || wallet.$id,
            stake: bet,
            win,
            result: outcome,
            createdAt:
              new Date().toISOString()
          }
        );

      } catch {}

      setFlashIndex(index);

    } catch (err) {

      console.log(err);

      setResult("❌ RESULT FAILED");
    }

    setGlow(false);
    setSpinning(false);
    setCanStop(false);

    setTimeout(() => {

      setFlashIndex(null);
      setResult("");
      setWon(0);
      setRotation(0);
      setStake("");

    }, 4000);
  };

  const handleStop = () => {

    if (!spinning) return;

    clearTimeout(timeoutRef.current);

    finishSpin();
  };

  return (
    <div style={{
      textAlign: "center",
      paddingTop: 120
    }}>

      {/* RETURNS */}
      <div style={{
        position: "fixed",
        top: 10,
        left: 10,
        background: "#000",
        color: "gold",
        fontWeight: "bold",
        padding: 10,
        borderRadius: 10,
        border: "1px solid gold"
      }}>