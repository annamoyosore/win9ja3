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

const lock=useRef(false);

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

// 💬 MESSAGE BADGE
useEffect(()=>{
  if(!gameId||!userId)return;

  const load=async()=>{
    try{
      const r=await databases.listDocuments(
        DATABASE_ID,"messages",
        [Query.equal("gameId",gameId),Query.notEqual("sender",userId)]
      );
      setUnread(r.total||0);
    }catch{ setUnread(0); }
  };

  load();

  const unsub=databases.client.subscribe(
    `databases.${DATABASE_ID}.collections.messages.documents`,
    load
  );

  return ()=>unsub();
},[gameId,userId]);

if(!game||!userId) return <div>Loading...</div>;

const myIdx=game.players.indexOf(userId);
if(myIdx===-1) return <div>Joining...</div>;

const oppIdx=myIdx===0?1:0;

// 🏁 END ROUND
async function endRound(g,winner){
  g=JSON.parse(JSON.stringify(g));
  g.scores[winner]=(g.scores[winner]||0)+1;

  if(g.scores[winner]>=2 && !g.payoutDone){
    g.status="finished";
    g.winnerId=g.players[winner];
    g.payoutDone=true;

    try{
      const res=await databases.listDocuments(
        DATABASE_ID,WALLET_COLLECTION,
        [Query.equal("userId",g.winnerId)]
      );

      if(res.documents.length){
        const w=res.documents[0];
        await databases.updateDocument(
          DATABASE_ID,WALLET_COLLECTION,w.$id,
          {balance:Number(w.balance||0)+Number(g.pot||0)}
        );
      }
    }catch{}

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
  if(lock.current) return;
  if(game.turn!==userId) return;

  lock.current=true;

  try{
    const g=JSON.parse(JSON.stringify(game));
    const card=g.hands[myIdx][i];
    const top=g.discard;

    const num=card.slice(1);
    const topNum=top.slice(1);

    if(g.pendingPick>0 && num!=="2" && num!=="14"){
      setError("❌ Use 2 or WHOT");
      setTimeout(()=>setError(""),1000);
      lock.current=false; return;
    }

    if(num!=="14" && card[0]!==top[0] && num!==topNum){
      setError("❌ Invalid move");
      setTimeout(()=>setError(""),1000);
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
  if(lock.current) return;
  if(game.turn!==userId) return;

  lock.current=true;

  try{
    const g=JSON.parse(JSON.stringify(game));

    if(!g.deck.length){
      const win=g.hands[0].length<g.hands[1].length?0:1;
      await endRound(g,win);
      lock.current=false; return;
    }

    const picks=g.pendingPick||1;

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

// UI
const hand=game.hands[myIdx]||[];
const isWinner=game.winnerId===userId;

return (
<div style={{padding:10}}>
<h2>WHOT GAME</h2>

<div onClick={()=>openChat(gameId)}>
💬 Messages {unread>0 && `(${unread})`}
</div>

{error && <div style={{color:"red"}}>{error}</div>}

<p>{game.turn===userId?"Your Turn":"Opponent"}</p>

<p>Score: {game.scores[0]} - {game.scores[1]}</p>

<p>Top: {game.discard}</p>

<button onClick={draw}>Draw ({game.deck.length})</button>

<div style={{display:"flex",gap:5}}>
{hand.map((c,i)=>(
  <button key={i} onClick={()=>playCard(i)}>
    {c}
  </button>
))}
</div>

{game.status==="finished" && (
<h3>{isWinner?"You Won":"You Lost"}</h3>
)}

<button onClick={goHome}>Exit</button>

</div>
);
}