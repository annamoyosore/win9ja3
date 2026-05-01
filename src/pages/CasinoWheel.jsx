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
  const [countdown, setCountdown] = useState(null);
  const [feeds, setFeeds] = useState([]);

  const audioCtxRef = useRef(null);
  const spinSoundRef = useRef(null);

  // =========================
  // NAMES FOR FEED
  // =========================
  const names = [
    "Emeka","Tunde","Blessing","Chioma","Ibrahim",
    "Sadiq","Zainab","Kelvin","Uche","Mary",
    "Aisha","David","Samuel","Joy","Paul",
    "Esther","Yusuf","Musa","Favour","Henry",
    "Olamide","Chinedu","Ngozi","Bola","Sule"
  ];

  // =========================
  // LOAD WALLET
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

    if (w.documents.length) setWallet(w.documents[0]);
  }

  // =========================
  // LIVE WIN FEED
  // =========================
  useEffect(() => {
    const interval = setInterval(() => {

      const name = names[Math.floor(Math.random() * names.length)];
      const types = ["x3","x10","JACKPOT"];
      const type = types[Math.floor(Math.random()*types.length)];

      let amount = Math.floor(Math.random()*50000)+5000;
      if (type==="x10") amount*=2;
      if (type==="JACKPOT") amount*=5;

      const id = Date.now();

      setFeeds(prev => [...prev,{id,message:`${name} won ₦${amount.toLocaleString()} (${type}) 🎉`}].slice(-30));

      setTimeout(()=>{
        setFeeds(prev => prev.filter(f=>f.id!==id));
      },4000);

    },3000);

    return ()=>clearInterval(interval);
  },[]);

  // =========================
  // SEGMENTS
  // =========================
  const segments = [
    "❌ Lose","x2","🎁 Free","x3",
    "➖ -50%","x1","🔥 x10","💎 JACKPOT ×30"
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
  // SAFE LOUD TICK SOUND
  // =========================
  function startTickSound() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }

    const ctx = audioCtxRef.current;
    let running = true;

    const tick = () => {
      if (!running) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.value = 950;

      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

      osc.start();
      osc.stop(ctx.currentTime + 0.06);

      spinSoundRef.current = setTimeout(tick, 80);
    };

    tick();

    return () => {
      running = false;
      clearTimeout(spinSoundRef.current);
    };
  }

  // =========================
  // RESET
  // =========================
  const startReset = () => {
    let t = 5;
    setCountdown(t);

    const i = setInterval(()=>{
      t--;
      setCountdown(t);
      if(t<=0){
        clearInterval(i);
        setRotation(0);
        setResult("");
        setWon(0);
        setCountdown(null);
      }
    },1000);
  };

  // =========================
  // SPIN
  // =========================
  const spin = async () => {
    if (spinning || countdown) return;

    const numericStake = Number(stake);
    if ((!numericStake || numericStake<=0) && freeSpins<=0){
      setResult("⚠️ Enter stake");
      return;
    }

    if (freeSpins<=0 && wallet.balance < numericStake){
      setResult("❌ Insufficient balance");
      return;
    }

    const stopTick = startTickSound();

    setSpinning(true);
    setResult("");
    setWon(0);

    const outcome = getResult();

    const map = {
      LOSE:0,X2:1,FREE:2,X3:3,HALF:4,X1:5,X10:6
    };

    const index = map[outcome];
    const stopAngle = 360 - (index * segmentAngle + segmentAngle / 2);
    const finalRotation = rotation + 1440 + stopAngle;

    setRotation(finalRotation);

    setTimeout(async ()=>{

      stopTick();

      let win=0;
      let newBalance = wallet.balance;

      if(outcome==="LOSE"){
        if(freeSpins<=0) newBalance-=numericStake;
        setResult(`❌ Lost ₦${numericStake}`);

      } else if(outcome==="HALF"){
        const loss = numericStake/2;
        if(freeSpins<=0) newBalance-=loss;
        setResult(`➖ Lost ₦${loss}`);

      } else if(outcome==="X1"){
        setResult("⚖️ No Gain");

      } else if(outcome==="FREE"){
        setFreeSpins(f=>f+1);
        setResult("🎁 Free Spin!");

      } else {
        const mult = parseInt(outcome.replace("X",""));
        win = numericStake * mult;

        if(freeSpins<=0) newBalance-=numericStake;
        newBalance+=win;

        setWon(win);
        setResult(`🎉 Won ₦${win}`);
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance:newBalance }
      );

      setWallet({...wallet,balance:newBalance});

      await databases.createDocument(
        DATABASE_ID,
        "casino_spins",
        ID.unique(),
        {
          userId,
          stake:numericStake,
          outcome,
          winAmount:win,
          balanceAfter:newBalance,
          createdAt:new Date().toISOString()
        }
      );

      setSpinning(false);
      startReset();

    },3000);
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{textAlign:"center",color:"#fff",padding:20}}>

      <h2>🎡 Casino Jackpot</h2>

      <div style={{background:"#111",padding:10,borderRadius:10}}>
        💰 ₦{Number(wallet?.balance||0).toLocaleString()}
        <button onClick={loadWallet}>🔄</button>
      </div>

      <input
        type="number"
        placeholder="Stake"
        value={stake}
        onChange={(e)=>setStake(e.target.value)}
      />

      <p>🎟 Free Spins: {freeSpins}</p>

      {/* WHEEL */}
      <div style={{
        width:220,height:220,margin:"20px auto",
        borderRadius:"50%",border:"5px solid gold",
        position:"relative",
        transform:`rotate(${rotation}deg)`,
        transition:"transform 3s ease"
      }}>
        {segments.map((seg,i)=>(
          <div key={i} style={{
            position:"absolute",
            width:"50%",height:"50%",
            top:"50%",left:"50%",
            transformOrigin:"0% 0%",
            transform:`rotate(${i*segmentAngle}deg)`
          }}>
            <span style={{
              fontSize:14,
              fontWeight:"900",
              color: seg.includes("JACKPOT")?"gold":"white",
              textShadow: seg.includes("JACKPOT")
                ? "0 0 10px gold,0 0 20px gold"
                : "0 0 6px black",
              transform:"rotate(90deg)"
            }}>
              {seg}
            </span>
          </div>
        ))}
      </div>

      <button onClick={spin} style={{
        padding:"18px 40px",
        fontSize:20,
        background:"gold",
        border:"none",
        borderRadius:10
      }}>
        {spinning?"Spinning...":"🎡 SPIN"}
      </button>

      <p>{result}</p>
      <p>🏆 ₦{won}</p>

      {countdown && <p>🔄 Next spin in {countdown}s...</p>}

      {/* LIVE FEED */}
      <div style={{
        position:"fixed",
        top:10,left:"50%",
        transform:"translateX(-50%)",
        zIndex:999
      }}>
        {feeds.map(f=>(
          <div key={f.id} style={{
            background:"#22c55e",
            padding:"10px 15px",
            marginTop:8,
            borderRadius:8,
            fontWeight:"bold",
            animation:"fadeSlide 4s ease forwards"
          }}>
            {f.message}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeSlide {
          0% {opacity:0;transform:translateY(-20px);}
          20% {opacity:1;transform:translateY(0);}
          80% {opacity:1;}
          100% {opacity:0;transform:translateY(-20px);}
        }
      `}</style>

    </div>
  );
}