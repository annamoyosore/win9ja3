import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

const GAME_COLLECTION = "games";
const WALLET_COLLECTION = "wallets";

// 🔊 SOUND
function beep(freq = 200, duration = 200) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "square";

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

// 🎴 CARD DRAW
function drawCard(cardStr){
  if(!cardStr) return "";

  const shape = cardStr[0];
  const number = Number(cardStr.slice(1));

  const c = document.createElement("canvas");
  c.width=70; c.height=100;
  const ctx = c.getContext("2d");

  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,70,100);

  ctx.strokeStyle="#e11d48";
  ctx.strokeRect(2,2,66,96);

  ctx.fillStyle="#e11d48";
  ctx.font="bold 14px Arial";
  ctx.fillText(number,6,18);

  const cx=35,cy=55;

  if(shape==="c"){ctx.beginPath();ctx.arc(cx,cy,12,0,Math.PI*2);ctx.fill();}
  if(shape==="s") ctx.fillRect(cx-12,cy-12,24,24);

  if(shape==="t"){
    ctx.beginPath();
    ctx.moveTo(cx,cy-12);
    ctx.lineTo(cx-12,cy+12);
    ctx.lineTo(cx+12,cy+12);
    ctx.fill();
  }

  if(shape==="r") ctx.fillText("★",cx-8,cy+8);

  if(shape==="x"){
    ctx.fillRect(cx-3,cy-12,6,24);
    ctx.fillRect(cx-12,cy-3,24,6);
  }

  return c.toDataURL();
}

function drawBack(){
  const c=document.createElement("canvas");
  c.width=65;c.height=100;
  const ctx=c.getContext("2d");

  ctx.fillStyle="#111";
  ctx.fillRect(0,0,65,100);

  ctx.strokeStyle="#fff";
  ctx.strokeRect(2,2,61,96);

  ctx.fillStyle="#fff";
  ctx.fillText("🂠",18,60);

  return c.toDataURL();
}
function createDeck(){
  const valid = {
    c:[1,2,3,4,5,7,8,10,11,12,13,14],
    t:[1,2,3,4,5,7,8,10,11,12,13,14],
    s:[1,2,3,5,7,10,11,13,14],
    x:[1,2,3,5,7,10,11,13,14],
    r:[1,2,3,4,5,7,8]
  };

  let deck=[];
  Object.keys(valid).forEach(shape=>{
    valid[shape].forEach(n=>deck.push(shape+n));
  });

  return deck.sort(()=>Math.random()-0.5);
}

function parseGame(g){
  const safe=(v,s)=> typeof v==="string"?v.split(s).filter(Boolean):[];

  let players=Array.isArray(g.players)?g.players:safe(g.players,",");

  if(players.length<2){
    return {...g,players,hands:[[],[]],deck:[],discard:null,turn:null,
      scores:[0,0],round:1,status:"waiting",
      pendingPick:0,pot:Number(g.pot||0),payoutDone:false};
  }

  let handsRaw=safe(g.hands,"|");
  let hands=handsRaw.length===2?handsRaw.map(p=>safe(p,",")):[[],[]];
  let deck=safe(g.deck,",");

  if(!deck.length||!hands[0].length||!hands[1].length||!g.discard){
    const d=createDeck();
    return {...g,players,
      hands:[d.splice(0,6),d.splice(0,6)],
      deck:d,discard:d.pop(),turn:players[0],
      scores:[0,0],round:1,status:"playing",
      pendingPick:0,pot:Number(g.pot||0),payoutDone:false};
  }

  return {...g,players,hands,deck,discard:g.discard,
    turn:g.turn||players[0],
    scores:safe(g.scores,",").map(Number),
    round:Number(g.round||1),
    status:g.status||"playing",
    pendingPick:Number(g.pendingPick||0),
    pot:Number(g.pot||0),
    payoutDone:Boolean(g.payoutDone)};
}

function encodeGame(g){
  return {
    hands:g.hands.map(p=>p.join(",")).join("|"),
    deck:g.deck.join(","),
    discard:g.discard,
    turn:g.turn,
    scores:g.scores.join(","),
    round:String(g.round),
    status:g.status,
    pendingPick:String(g.pendingPick||0),
    pot:g.pot,
    payoutDone:g.payoutDone,
    winnerId:g.winnerId||null
  };
}
export default function WhotGame({ gameId, goHome }) {

const [game,setGame]=useState(null);
const [userId,setUserId]=useState(null);
const [error,setError]=useState("");

const lock=useRef(false);

// USER
useEffect(()=>{
  account.get().then(u=>setUserId(u.$id));
},[]);

// GAME SUBSCRIBE
useEffect(()=>{
  if(!gameId||!userId)return;

  databases.getDocument(DATABASE_ID,GAME_COLLECTION,gameId)
  .then(g=>setGame(parseGame(g)));

  const unsub=databases.client.subscribe(
    `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
    res=>setGame(parseGame(res.payload))
  );

  return ()=>unsub();
},[gameId,userId]);

if(!game||!userId) return <div>Loading...</div>;

const myIdx=game.players.indexOf(userId);
const oppIdx=myIdx===0?1:0;

// 🏁 END ROUND
async function endRound(g,winner){
  g=JSON.parse(JSON.stringify(g));
  g.scores[winner]++;

  if(g.scores[winner]>=2 && !g.payoutDone){
    g.status="finished";
    g.winnerId=g.players[winner];
    g.payoutDone=true;

    const res=await databases.listDocuments(
      DATABASE_ID,WALLET_COLLECTION,
      [Query.equal("userId",g.winnerId)]
    );

    if(res.documents.length){
      const w=res.documents[0];
      await databases.updateDocument(
        DATABASE_ID,WALLET_COLLECTION,w.$id,
        {balance:Number(w.balance)+Number(g.pot)}
      );
    }

    await databases.updateDocument(
      DATABASE_ID,GAME_COLLECTION,gameId,encodeGame(g)
    );
    return;
  }

  const d=createDeck();
  g.hands=[d.splice(0,6),d.splice(0,6)];
  g.deck=d;
  g.discard=d.pop();
  g.pendingPick=0;
  g.turn=g.players[winner===0?1:0];
  g.round++;

  await databases.updateDocument(
    DATABASE_ID,GAME_COLLECTION,gameId,encodeGame(g)
  );
}

// 🎴 PLAY
async function playCard(i){
  if(lock.current || game.turn!==userId) return;
  lock.current=true;

  const g=JSON.parse(JSON.stringify(game));
  const card=g.hands[myIdx][i];
  const top=g.discard;

  const num=card.slice(1);
  const topNum=top.slice(1);

  if(g.pendingPick>0 && num!=="2" && num!=="14"){
    setError("Play 2 or WHOT");
    beep(120);
    setTimeout(()=>setError(""),1000);
    lock.current=false;
    return;
  }

  if(num!=="14" && card[0]!==top[0] && num!==topNum){
    setError("Invalid move");
    beep(100);
    setTimeout(()=>setError(""),1000);
    lock.current=false;
    return;
  }

  g.hands[myIdx].splice(i,1);
  g.discard=card;

  if(num==="2") g.pendingPick+=2;
  if(num==="14") g.pendingPick+=1;

  if(!g.hands[myIdx].length){
    beep(600,300);
    await endRound(g,myIdx);
    lock.current=false;
    return;
  }

  const next=g.players[oppIdx];

  setGame({...g,turn:next});

  await databases.updateDocument(
    DATABASE_ID,GAME_COLLECTION,gameId,
    {...encodeGame(g),turn:next}
  );

  lock.current=false;
}

// UI
return (
<div style={{background:"#020617",minHeight:"100vh",color:"#fff",padding:12}}>

<h2 style={{textAlign:"center"}}>🎮 WHOT</h2>

{error && <div style={{color:"red",textAlign:"center"}}>{error}</div>}

<div style={{textAlign:"center"}}>
<img src={drawCard(game.discard)} style={{width:80}}/>
</div>

<div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",marginTop:20}}>
{game.hands[myIdx].map((c,i)=>(
<img key={i} src={drawCard(c)} style={{width:60,margin:5,cursor:"pointer"}}
onClick={()=>playCard(i)}/>
))}
</div>

<div style={{textAlign:"center",marginTop:20}}>
<button onClick={goHome}>Exit</button>
</div>

</div>
);
}