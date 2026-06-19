import React, { useState, useEffect } from "react";
import {
databases,
DATABASE_ID,
WALLET_COLLECTION,
account,
Query
} from "../lib/appwrite";

const ADMIN_WALLET_ID = "69f2482600125d496354";
const MIN_STAKE = 100;
const SIZE = 5;

// ================= BOARD =================
function createBoard(minesCount) {
const total = SIZE * SIZE;
const mineSet = new Set();

while (mineSet.size < minesCount) {
mineSet.add(Math.floor(Math.random() * total));
}

return Array.from({ length: total }, (_, i) => ({
isMine: mineSet.has(i),
revealed: false,
}));
}

function calcMultiplier(step, difficulty) {
return 1 + step * (0.25 * difficulty);
}

const mineMap = { 1: 8, 2: 12, 3: 16, 4: 20 };

export default function MineGame() {

// ================= STATE =================
const [wallet, setWallet] = useState(null);
const [admin, setAdmin] = useState(null);

const [difficulty, setDifficulty] = useState(1);

const [stakeInput, setStakeInput] = useState("");
const [activeStake, setActiveStake] = useState(null);

const [board, setBoard] = useState([]);

const [gameActive, setGameActive] = useState(false);
const [gameOver, setGameOver] = useState(false);
const [won, setWon] = useState(false);

const [step, setStep] = useState(0);
const [multi, setMulti] = useState(1);
const [cashout, setCashout] = useState(0);

const [loadingStart, setLoadingStart] = useState(false);

const minesCount = mineMap[difficulty];

// ================= LOAD WALLET =================
useEffect(() => {
loadData();
}, []);

async function loadData() {
try {
const u = await account.get();

const userRes = await databases.listDocuments(
DATABASE_ID,
WALLET_COLLECTION,
[Query.equal("userId", u.$id)]
);

const adminRes = await databases.getDocument(
DATABASE_ID,
WALLET_COLLECTION,
ADMIN_WALLET_ID
);

if (userRes.documents.length) {
setWallet(userRes.documents[0]);
}

setAdmin(adminRes);
} catch (e) {
console.error("LOAD ERROR:", e);
}

}

// ================= STAKE CONFIRM =================
const confirmStake = () => {
const stake = Number(stakeInput);

if (!wallet) return;
if (!stake || stake < MIN_STAKE) return;
if (wallet.balance < stake) return;

setActiveStake(stake);

};

// ================= START GAME =================
const startGame = async () => {
if (loadingStart || gameActive) return;
if (!activeStake || !wallet || !admin) return;

const stake = Number(activeStake);

setLoadingStart(true);

try {
// 1. deduct user wallet
const newBalance = wallet.balance - stake;

await databases.updateDocument(
DATABASE_ID,
WALLET_COLLECTION,
wallet.$id,
{ balance: newBalance }
);

setWallet((p) => ({ ...p, balance: newBalance }));

// 2. send to admin profit
await databases.updateDocument(
DATABASE_ID,
WALLET_COLLECTION,
ADMIN_WALLET_ID,
{
minesProfit: (admin.minesProfit || 0) + stake
}
);

setAdmin((p) => ({
...p,
minesProfit: (p?.minesProfit || 0) + stake
}));

// 3. start game session
setBoard(createBoard(minesCount));
setGameActive(true);
setGameOver(false);
setWon(false);
setStep(0);
setMulti(1);
setCashout(0);

} catch (e) {
console.error("START ERROR:", e);
}

setLoadingStart(false);

};

// ================= REVEAL CELL =================
const revealCell = (i) => {
if (!gameActive) return;

const newBoard = [...board];
const cell = newBoard[i];

if (cell.revealed) return;

cell.revealed = true;

if (cell.isMine) {

  // 💥 REVEAL ALL TILES (ONLY ADDITION)
  const revealedBoard = newBoard.map((c) => ({
    ...c,
    revealed: true
  }));

  setBoard(revealedBoard);
  setGameOver(true);
  setGameActive(false);

  return;
}

const newStep = step + 1;
const newMulti = calcMultiplier(newStep, difficulty);

setStep(newStep);
setMulti(newMulti);

setCashout(activeStake * newMulti);
setBoard(newBoard);

};

// ================= CASHOUT =================
const cashOutNow = async () => {
if (!gameActive || gameOver || step === 0) return;

const payout = cashout;

if ((admin.minesReserve || 0) < payout) return;

const newBalance = wallet.balance + payout;

await databases.updateDocument(
DATABASE_ID,
WALLET_COLLECTION,
wallet.$id,
{ balance: newBalance }
);

await databases.updateDocument(
DATABASE_ID,
WALLET_COLLECTION,
ADMIN_WALLET_ID,
{
minesReserve: (admin.minesReserve || 0) - payout
}
);

setWallet((p) => ({ ...p, balance: newBalance }));

setWon(true);
setGameActive(false);

};

const locked = !gameActive;

// ================= UI =================
return (

<div style={{  
textAlign: "center",  
padding: 20,  
background: "#0b0f1a",  
minHeight: "100vh",  
color: "white"  
}}>  <h2 style={{ color: "gold" }}>💣 Mines Game</h2>    {/* WALLET */}

  <div style={{ marginBottom: 10 }}>    
    💰 Balance: ₦{wallet?.balance || 0}    
  </div>    {/* STAKE */}

  <div style={{    
    padding: 10,    
    background: "#111",    
    borderRadius: 10,    
    marginBottom: 10    
  }}>    
    <input    
      type="number"    
      placeholder={`Min ₦${MIN_STAKE}`}    
      value={stakeInput}    
      onChange={(e) => setStakeInput(e.target.value)}    
    />    <button onClick={confirmStake} style={{ marginLeft: 10 }}>    
  SET STAKE    
</button>    

{activeStake && (    
  <div>🎯 Stake: ₦{activeStake}</div>    
)}

  </div>    {/* DIFFICULTY */}

  <div style={{ marginBottom: 10 }}>    
    Difficulty:    
    <select    
      value={difficulty}    
      onChange={(e) => setDifficulty(Number(e.target.value))}    
    >    
      <option value={1}>x1</option>    
      <option value={2}>x2</option>    
      <option value={3}>x3</option>    
      <option value={4}>x4</option>    
    </select>    
  </div>    {/* START */}
<button
onClick={startGame}
disabled={!activeStake || gameActive}
style={{
padding: "10px 18px",
background: activeStake ? "#22c55e" : "#555",
color: "white",
border: "none",
borderRadius: 8,
cursor: "pointer"
}}

> 

{loadingStart ? "STARTING..." : "START GAME"}

  </button>    {/* CASHOUT */}
<button
onClick={cashOutNow}
style={{
marginLeft: 10,
padding: "10px 18px",
background: "#f59e0b",
border: "none",
borderRadius: 8
}}

> 

CASH OUT

  </button>    {/* INFO */}

  <div style={{ marginTop: 10 }}>    
    💣 Bombs: {mineMap[difficulty]} <br />    
    📈 Multiplier: {multi.toFixed(2)}x <br />    
    💰 Cashout: ₦{cashout.toFixed(2)}    
  </div>    {/* STATUS */}
{gameOver && <h3 style={{ color: "red" }}>💥 BOOM!</h3>}
{won && <h3 style={{ color: "lime" }}>🎉 WIN ₦{cashout.toFixed(2)}</h3>}

{/* BOARD */}

  <div style={{    
    display: "grid",    
    gridTemplateColumns: `repeat(${SIZE}, 55px)`,    
    justifyContent: "center",    
    gap: 6,    
    marginTop: 20,    
    opacity: gameActive ? 1 : 0.4,    
    pointerEvents: gameActive ? "auto" : "none"    
  }}>    
    {board.map((cell, i) => (    
      <div    
        key={i}    
        onClick={() => revealCell(i)}    
        style={{    
          width: 55,    
          height: 55,    
          background: cell.revealed    
            ? cell.isMine ? "red" : "#222"    
            : "#444",    
          display: "flex",    
          alignItems: "center",    
          justifyContent: "center",    
          borderRadius: 8,    
          cursor: "pointer"    
        }}    
      >    
        {cell.revealed ? (cell.isMine ? "💣" : "💎") : "?"}    
      </div>    
    ))}    
  </div>    </div>  );
}