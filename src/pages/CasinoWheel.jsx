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

const APP_VERSION = "1.1.2";

const names = ["Emeka","Tunde","Chioma","Ibrahim","Mary","David","Zainab"];
const cities = ["Lagos","Abuja","Ibadan","Kano","Enugu"];

export default function CasinoWheel({ goBack }) {

  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [feed, setFeed] = useState([]);
  const [flowers, setFlowers] = useState([]);

  // 🎯 UPDATED POOL (matches wheel better)
  const pool = [
    { type: "LOSE", w: 0.60 },
    { type: "LOSE2", w: 0.15 },
    { type: "FREE", w: 0.10 },
    { type: "X1", w: 0.10 },
    { type: "X2", w: 0.025 },
    { type: "X3", w: 0.01 },
    { type: "X10", w: 0.003 },
    { type: "JACKPOT", w: 0.002 }
  ];

  // 🎡 WHEEL
  const segments = [
    { label: "❌ LOSE", type: "LOSE", color: "#ef4444" },
    { label: "x2", type: "X2", color: "#22c55e" },
    { label: "🎁 FREE", type: "FREE", color: "#3b82f6" },
    { label: "x3", type: "X3", color: "#a855f7" },
    { label: "❌ LOSE", type: "LOSE2", color: "#ef4444" },
    { label: "x1", type: "X1", color: "#f59e0b" },
    { label: "🔥 x10", type: "X10", color: "#f97316" },
    { label: "💎 ×30", type: "JACKPOT", color: "#eab308" }
  ];

  const segmentAngle = 360 / segments.length;

  const gradient = `conic-gradient(${segments
    .map((s, i) => `${s.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`)
    .join(",")})`;

  const map = {
    LOSE: 0,
    X2: 1,
    FREE: 2,
    X3: 3,
    LOSE2: 4,
    X1: 5,
    X10: 6,
    JACKPOT: 7
  };

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    loadWallet();

    const saved = localStorage.getItem("app_version");
    if (saved !== APP_VERSION) {
      localStorage.setItem("app_version", APP_VERSION);
      window.location.reload();
    }

    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes fall {
        to { transform: translateY(110vh) rotate(360deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    // 🔥 LIVE FEED
    const interval = setInterval(() => {
      const name = names[Math.floor(Math.random() * names.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const amount = Math.floor(Math.random() * 50000) + 2000;

      const msg =
        Math.random() > 0.5
          ? `${name} from ${city} won ₦${amount}`
          : `${name} from ${city} withdrew ₦${amount}`;

      const id = Date.now();

      setFeed(prev => [...prev, { id, msg }]);

      setTimeout(() => {
        setFeed(prev => prev.filter(f => f.id !== id));
      }, 4000);

    }, 5000);

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

  // =========================
  // RESULT ENGINE
  // =========================
  const getResult = () => {
    let r = Math.random(), sum = 0;
    for (let p of pool) {
      sum += p.w;
      if (r <= sum) return p.type;
    }
    return "LOSE";
  };

  function spawnFlowers() {
    const items = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100
    }));
    setFlowers(items);
    setTimeout(() => setFlowers([]), 3000);
  }

  // =========================
  // SPIN
  // =========================
  const spin = async () => {
    if (spinning || !wallet) return;

    const amount = Number(stake);

    if (!amount || amount < 50) return setResult("Minimum ₦50");
    if (wallet.balance < amount) return setResult("Insufficient balance");

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();
    const index = map[outcome];

    // 🎯 PERFECT POINTER ALIGNMENT (TOP POINTER FIX)
    const target = index * segmentAngle + segmentAngle / 2;
    const finalAngle = (360 - target + 90) % 360;

    const spins = 5 * 360;

    setRotation(prev => {
      const base = prev % 360;
      return base + spins + finalAngle;
    });

    setTimeout(async () => {

      let balanceBefore = wallet.balance;
      let newBalance = wallet.balance - amount;
      let win = 0;
      let status = "lose";

      if (outcome === "FREE") {
        newBalance += amount;
        status = "free";
        setResult("🎁 Free Spin");

      } else if (outcome === "X1") {
        newBalance += amount;
        status = "neutral";
        setResult("⚖️ Stake Returned");

      } else if (["X