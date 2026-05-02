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

const [userId, setUserId] = useState(null);
const [wallet, setWallet] = useState(null);

const [stake, setStake] = useState("");
const [rotation, setRotation] = useState(0);
const [result, setResult] = useState("");
const [won, setWon] = useState(0);
const [spinning, setSpinning] = useState(false);
const [freeSpins, setFreeSpins] = useState(0);
const [countdown, setCountdown] = useState(null);
const [popup, setPopup] = useState(null);
const [flowers, setFlowers] = useState([]);

const audioCtxRef = useRef(null);
const tickerRef = useRef(null);

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

// ================= SEGMENTS =================
const segments = [
"❌ Lose",
"x2",
"🎁 Free",
"x3",
"❌ Lose",
"x1",
"🔥 x10",
"💎 JACKPOT ×30"
];

const segmentAngle = 360 / segments.length;

// ================= LOGIC =================
const pool = [
{ type: "LOSE", weight: 0.39 },
{ type: "LOSE2", weight: 0.05 },
{ type: "X1", weight: 0.10 },
{ type: "FREE", weight: 0.24 },
{ type: "X2", weight: 0.18 },
{ type: "X3", weight: 0.03 },
{ type: "X10", weight: 0.009 },
{ type: "JACKPOT", weight: 0.001 }
];

const getResult = () => {
let r = Math.random(), sum = 0;
for (let p of pool) {
sum += p.weight;
if (r <= sum) return p.type;
}
};

// ================= SOUND =================
const playTick = () => {
if (!audioCtxRef.current) {
audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
}
const ctx = audioCtxRef.current;

const o = ctx.createOscillator();
const g = ctx.createGain();

o.connect(g);
g.connect(ctx.destination);

o.frequency.value = 600;
g.gain.value = 0.05;

o.start();
setTimeout(() => o.stop(), 40);
};

const startTicking = () => {
let speed = 40;

const tickLoop = () => {
playTick();
speed += 6;
tickerRef.current = setTimeout(tickLoop, speed);
};

tickLoop();
};

const stopTicking = () => {
clearTimeout(tickerRef.current);
};

// ================= EFFECTS =================
const spawnFlowers = () => {
const items = Array.from({ length: 40 }).map((_, i) => ({
id: i,
left: Math.random() * 100
}));
setFlowers(items);
setTimeout(() => setFlowers([]), 3000);
};

// ================= RESET =================
const startCountdown = () => {
let t = 4;
setCountdown(t);

const int = setInterval(() => {
t--;
setCountdown(t);

if (t <= 0) {
clearInterval(int);
resetGame();
}
}, 1000);
};

const resetGame = () => {
setRotation(prev => prev % 360);
setResult("");
setWon(0);
setCountdown(null);
setPopup(null);
};

// ================= SPIN =================
const spin = async () => {
if (spinning) return;

const numericStake = Number(stake);

if ((!numericStake || numericStake < 50) && freeSpins <= 0) {
setResult("⚠️ Minimum stake ₦50");
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
LOSE2: 4,
X1: 5,
X10: 6,
JACKPOT: 7
};

const index = map[outcome];

// 🎯 PERFECT TARGET
const targetAngle = index * segmentAngle + segmentAngle / 2;
const stopAngle = 360 - targetAngle;

const spinDuration = 4500 + Math.random() * 1000;

startTicking();

setRotation(prev => {
const base = prev % 360;
return base + 1800 + stopAngle;
});

// 🧲 MAGNETIC SNAP
setTimeout(() => {
setRotation(prev => {
const snapped = Math.round(prev / segmentAngle) * segmentAngle;
return snapped;
});
}, spinDuration - 180);

setTimeout(async () => {

stopTicking();

let balanceBefore = wallet.balance;
let newBalance = wallet.balance;
let win = 0;
let status = "lose";
let netChange = 0;

if (freeSpins > 0) {
setFreeSpins(f => f - 1);
} else {
newBalance -= numericStake;
}

if (outcome === "LOSE" || outcome === "LOSE2") {
status = "lose";
netChange = -numericStake;
setPopup("lose");
setResult("❌ Lost ₦${numericStake}");

} else if (outcome === "FREE") {
status = "free";
setFreeSpins(f => f + 1);
setPopup("free");
setResult("🎁 Free Spin!");

} else if (outcome === "X1") {
status = "neutral";
newBalance += numericStake;
setPopup("neutral");
setResult("⚖️ Stake Returned");

} else {
const mult = outcome === "JACKPOT" ? 30 : parseInt(outcome.replace("X",""));
win = numericStake * mult;
newBalance += win;

status = "win";
netChange = win - numericStake;

setWon(win);
spawnFlowers();
setPopup("win");
setResult(outcome === "JACKPOT" ? `💎 JACKPOT ₦${win}` : `🎉 Won ₦${win}`);

}

try {
await databases.updateDocument(
DATABASE_ID,
WALLET_COLLECTION,
wallet.$id,
{ balance: newBalance }
);
setWallet({ ...wallet, balance: newBalance });
} catch {}

try {
const u = await account.get();

await databases.createDocument(
  DATABASE_ID,
  CASINO_COLLECTION,
  ID.unique(),
  {
    userId: u.$id,
    type: "spin",
    status,
    outcome,
    stake: numericStake,
    winAmount: win,
    netChange,
    balanceBefore,
    balanceAfter: newBalance
  }
);

} catch {}

setSpinning(false);
startCountdown();

}, spinDuration);
};

// ================= UI =================
return (
<>

<style>{`
.wheel {
width:240px;
height:240px;
border-radius:50%;
border:6px solid gold;
position:relative;
overflow:hidden;
margin:auto;
transition:transform 4.5s cubic-bezier(0.15,0.85,0.25,1);
}

.segment {
position:absolute;
width:50%;
height:50%;
top:50%;
left:50%;
transform-origin:0% 0%;
display:flex;
align-items:center;
justify-content:center;
clip-path: polygon(0% 0%, 100% 50%, 0% 100%);
}

.label {
position:absolute;
top:50%;
left:50%;
transform-origin:0 0;
width:110px;
text-align:center;
font-weight:900;
font-size:13px;
color:white;
text-shadow:0 0 6px black;
pointer-events:none;
}

.pointer {
font-size:26px;
text-align:center;
position:relative;
z-index:10;
}
`}</style><div style={{ textAlign:"center", color:"#fff", padding:20 }}><button onClick={goBack}>← Exit</button>

<h2>🎡 Casino Jackpot</h2><div>
💰 ₦{Number(wallet?.balance || 0).toLocaleString()}
<button onClick={loadWallet}>🔄</button>
</div><input
type="number"
placeholder="Min ₦50"
value={stake}
onChange={(e)=>setStake(e.target.value)}
/>

<p>🎟 Free Spins: {freeSpins}</p><div className="pointer">🔻</div><div className="wheel" style={{ transform:`rotate(${rotation}deg)` }}>
{segments.map((s,i)=>(
<div
key={i}
className="segment"
style={{
transform:`rotate(${i*segmentAngle}deg)`,
background:`hsl(${i*45},80%,50%)`
}}
>
<span
className="label"
style={{
transform:`
rotate(${i * segmentAngle + segmentAngle / 2}deg)
translate(55px,-50%)
rotate(${-(i * segmentAngle + segmentAngle / 2)}deg)
`
}}
>
{s}
</span>
</div>
))}
</div><button onClick={spin}>
{spinning ? "Spinning..." : "🎡 SPIN"}
</button><p>{result}</p>
<p>🏆 ₦{won}</p></div>
</>
);
}