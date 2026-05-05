import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query,
  ID
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
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration / 1000
    );

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

// 🎴 DECK
function createDeck() {
  const valid = {
    c:[1,2,3,4,5,7,8,10,11,12,13,14],
    t:[1,2,3,4,5,7,8,10,11,12,13,14],
    s:[1,2,3,5,7,10,11,13,14],
    x:[1,2,3,5,7,10,11,13,14],
    r:[1,2,3,4,5,7,8]
  };

  let deck = [];
  Object.keys(valid).forEach(shape=>{
    valid[shape].forEach(n=>deck.push(shape+n));
  });

  return deck.sort(()=>Math.random()-0.5);
}

// 🎴 DRAW CARD
function drawCard(cardStr){
  if(!cardStr) return null;

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

// 🛠 PARSE
function parseGame(g){
  const safe=(v,s)=> typeof v==="string"?v.split(s).filter(Boolean):[];

  let players=Array.isArray(g.players)?g.players:safe(g.players,",");

  if(players.length<2){
    return {...g,players,hands:[[],[]],deck:[],discard:null,turn:null,
      history:[],scores:[0,0],round:1,status:"waiting",
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
      history:[],scores:[0,0],round:1,status:"playing",
      pendingPick:0,pot:Number(g.pot||0),payoutDone:false};
  }

  return {...g,players,hands,deck,discard:g.discard,
    turn:g.turn||players[0],
    history:safe(g.history,"||"),
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
    history:(g.history||[]).slice(-20).join("||"),
    scores:g.scores.join(","),
    round:String(g.round),
    status:g.status,
    pendingPick:String(g.pendingPick||0),
    pot:g.pot,
    payoutDone:g.payoutDone,
    winnerId:g.winnerId||null
  };
}
export default function WhotGame({ gameId, goHome, openChat }) {

const [game,setGame]=useState(null);
const [userId,setUserId]=useState(null);
const [error,setError]=useState("");
const [unread,setUnread]=useState(0);
const [countdown,setCountdown]=useState(5);

const lock=useRef(false);
const cleared=useRef(false);

const name=i=>i===0?"Player 1":"Player 2";

// 👤 USER
useEffect(()=>{
  account.get().then(u=>setUserId(u.$id)).catch(()=>{});
},[]);

// 🎮 GAME
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

// 💬 MESSAGES
useEffect(()=>{
  if(!gameId||!userId)return;

  const load=async()=>{
    const r=await databases.listDocuments(
      DATABASE_ID,"messages",
      [Query.equal("gameId",gameId),Query.notEqual("sender",userId)]
    ).catch(()=>({total:0}));

    setUnread(r.total||0);
  };

  load();

  const unsub=databases.client.subscribe(
    `databases.${DATABASE_ID}.collections.messages.documents`,
    load
  );

  return ()=>unsub();
},[gameId,userId]);

// 🧹 CLEAR CHAT
async function clearMessages(){
  if(cleared.current)return;
  cleared.current=true;

  try{
    const res=await databases.listDocuments(
      DATABASE_ID,"messages",
      [Query.equal("gameId",gameId)]
    );

    await Promise.all(res.documents.map(d=>
      databases.deleteDocument(DATABASE_ID,"messages",d.$id)
    ));
  }catch{}
}

// 🏁 END ROUND
async function endRound(g,winner){
  g=JSON.parse(JSON.stringify(g));
  g.scores[winner]=(g.scores[winner]||0)+1;

  if(g.scores[winner]>=2 && !g.payoutDone){
    g.status="finished";
    g.winnerId=g.players[winner];
    g.payoutDone=true;

    // 💰 PAYOUT
    try{
      const w=await databases.listDocuments(
        DATABASE_ID,"wallets",
        [Query.equal("userId",g.winnerId)]
      );

      if(w.documents.length){
        const wallet=w.documents[0];
        await databases.updateDocument(
          DATABASE_ID,"wallets",wallet.$id,
          {balance:Number(wallet.balance||0)+Number(g.pot||0)}
        );
      }
    }catch{}

    await databases.updateDocument(
      DATABASE_ID,GAME_COLLECTION,gameId,encodeGame(g)
    );
    return;
  }

  // NEXT ROUND
  const d=createDeck();
  g.hands=[d.splice(0,6),d.splice(0,6)];
  g.deck=d;
  g.discard=d.pop();
  g.pendingPick=0;
  g.turn=g.players[0];
  g.round++;

  await databases.updateDocument(
    DATABASE_ID,GAME_COLLECTION,gameId,encodeGame(g)
  );
}

// 🎴 PLAY
async function playCard(i){
  if(lock.current||game.status==="finished")return;
  if(game.turn!==userId)return;

  lock.current=true;

  try{
    const g=JSON.parse(JSON.stringify(game));
    const card=g.hands[myIdx][i];
    const top=g.discard;

    const num=card.slice(1);
    const topNum=top.slice(1);

    if(g.pendingPick>0 && num!=="2" && num!=="14"){
      setError("❌ Respond with 2 or WHOT");
      beep(120); setTimeout(()=>setError(""),1200);
      lock.current=false; return;
    }

    if(num!=="14" && card[0]!==top[0] && num!==topNum){
      setError("❌ Invalid move");
      beep(100); setTimeout(()=>setError(""),1200);
      lock.current=false; return;
    }

    g.hands[myIdx].splice(i,1);
    g.discard=card;

    let next=g.players[oppIdx];

    if(num==="1") next=g.players[myIdx];
    if(num==="2") g.pendingPick+=2;
    if(num==="8") next=g.players[myIdx];
    if(num==="14") g.pendingPick+=1;

    if(!g.hands[myIdx].length){
      await endRound(g,myIdx);
      lock.current=false; return;
    }

    setGame({...g,turn:next});

    await databases.updateDocument(
      DATABASE_ID,GAME_COLLECTION,gameId,
      {...encodeGame(g),turn:next}
    );

  }catch{}

  lock.current=false;
}
// 🃏 DRAW
async function draw(){
  if(lock.current||game.status==="finished")return;
  if(game.turn!==userId)return;

  lock.current=true;

  try{
    const g=JSON.parse(JSON.stringify(game));

    if(!g.deck.length){
      const p1=g.hands[0].length;
      const p2=g.hands[1].length;

      if(p1===p2){
        const d=createDeck();
        g.hands=[d.splice(0,6),d.splice(0,6)];
        g.deck=d;
        g.discard=d.pop();
        g.round++;

        await databases.updateDocument(
          DATABASE_ID,GAME_COLLECTION,gameId,encodeGame(g)
        );
        lock.current=false;return;
      }

      const win=p1<p2?0:1;
      await endRound(g,win);
      lock.current=false;return;
    }

    const picks=g.pendingPick>0?g.pendingPick:1;

    for(let i=0;i<picks;i++){
      if(g.deck.length) g.hands[myIdx].push(g.deck.pop());
    }

    g.pendingPick=0;

    const next=g.players[oppIdx];

    setGame({...g,turn:next});

    await databases.updateDocument(
      DATABASE_ID,GAME_COLLECTION,gameId,
      {...encodeGame(g),turn:next}
    );

  }catch{}

  lock.current=false;
}

const myIdx=game.players.indexOf(userId);
if(myIdx===-1)return <div>Joining...</div>;

const oppIdx=myIdx===0?1:0;
const hand=game.hands[myIdx]||[];
const oppCards=game.hands[oppIdx]?.length||0;
const isWinner=game.winnerId===userId;

// 🏁 FINISH FLOW
useEffect(()=>{
  if(game?.status==="finished"){
    clearMessages();

    if(isWinner) beep(500,400);
    else beep(120,400);

    const t=setInterval(()=>{
      setCountdown(c=>{
        if(c<=1){goHome();return 0;}
        return c-1;
      });
    },1000);

    return()=>clearInterval(t);
  }
},[game?.status]);

return (
<div style={styles.bg}>
<div style={styles.box}>

<h2>🎮 WHOT GAME</h2>

<div style={styles.messageBar} onClick={()=>openChat(gameId)}>
  <span>💬 Messages</span>
  {unread>0 && <span style={styles.badge}>{unread}</span>}
</div>

{error && <div style={styles.error}>{error}</div>}

<div style={{textAlign:"center"}}>
{Array.from({length:oppCards}).map((_,i)=>
  <img key={i} src={drawBack()} style={{width:40}}/>
)}
<div>Player {oppIdx+1} ({oppCards})</div>
</div>

<p style={{textAlign:"center"}}>
{game.turn===userId?"🟢 YOUR TURN":"⏳ OPPONENT"}
</p>

<div style={styles.row}>
<span>Round {game.round}/3</span>
<span>{game.scores[0]} - {game.scores[1]}</span>
</div>

<div style={styles.row}>
<span>🏦 ₦{game.pot}</span>
</div>

<div style={styles.center}>
{game.discard && <img src={drawCard(game.discard)} style={styles.card}/>}
<button style={styles.marketBtn} onClick={draw}>
🃏 {game.deck.length}
</button>
</div>

<div style={styles.hand}>
{hand.map((c,i)=>
<img key={i} src={drawCard(c)} style={styles.card}
onClick={()=>playCard(i)}/>
)}
</div>

{game.status==="finished" && (
<div style={{textAlign:"center"}}>
<h3>{isWinner?"🏆 YOU WON 🎉":"❌ YOU LOST"}</h3>
<p>{isWinner?`+₦${game.pot}`:`-₦${game.pot}`}</p>
<p>Leaving in {countdown}s...</p>
</div>
)}

<button onClick={goHome}>Exit</button>

</div>
</div>
);
}