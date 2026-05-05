import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account, Query } from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";

// 🔊 SOUND
function beep(freq = 200, duration = 80) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
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
  Object.keys(valid).forEach(shape => {
    valid[shape].forEach(n => deck.push(shape+n));
  });

  return deck.sort(() => Math.random() - 0.5);
}

// 🎴 CARD CACHE
const cache = new Map();
function drawCard(card) {
  if (!card) return null;
  if (cache.has(card)) return cache.get(card);

  const c = document.createElement("canvas");
  c.width = 70; c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,70,100);
  ctx.strokeRect(2,2,66,96);
  ctx.fillText(card.slice(1),6,16);

  const url = c.toDataURL();
  cache.set(card,url);
  return url;
}

const backCard = (() => {
  const c = document.createElement("canvas");
  c.width = 65; c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#111";
  ctx.fillRect(0,0,65,100);
  ctx.fillStyle = "#fff";
  ctx.fillText("🂠",20,60);

  return c.toDataURL();
})();

// 🛠 PARSE
function parseGame(g){
  const safe=(v,s)=>typeof v==="string"?v.split(s).filter(Boolean):[];

  let players = Array.isArray(g.players)?g.players:safe(g.players,",");
  let handsRaw = safe(g.hands,"|");
  let hands = handsRaw.length===2?handsRaw.map(p=>safe(p,",")):[[],[]];
  let deck = safe(g.deck,",");

  if(!deck.length || !hands[0].length){
    const d = createDeck();
    return {
      ...g,
      players,
      hands:[d.splice(0,6),d.splice(0,6)],
      deck:d,
      discard:d.pop(),
      turn:players[0],
      scores:[0,0],
      round:1,
      history:[],
      status:"playing",
      pendingPick:0,
      pot:Number(g.pot||0),
      payoutDone:false
    };
  }

  return {
    ...g,
    players,
    hands,
    deck,
    discard:g.discard,
    turn:g.turn,
    history:safe(g.history,"||"),
    scores:safe(g.scores,",").map(Number),
    round:Number(g.round||1),
    status:g.status||"playing",
    pendingPick:Number(g.pendingPick||0),
    pot:Number(g.pot||0),
    payoutDone:Boolean(g.payoutDone)
  };
}

function encodeGame(g){
  return {
    hands:g.hands.map(p=>p.join(",")).join("|"),
    deck:g.deck.join(","),
    discard:g.discard,
    turn:g.turn,
    history:g.history.slice(-20).join("||"),
    scores:g.scores.join(","),
    round:String(g.round),
    status:g.status,
    pendingPick:String(g.pendingPick),
    pot:g.pot,
    payoutDone:g.payoutDone,
    winnerId:g.winnerId||null
  };
}
export default function WhotGame({gameId, goHome}) {

  const [game,setGame]=useState(null);
  const [userId,setUserId]=useState(null);
  const [countdown,setCountdown]=useState(5);
  const [error,setError]=useState("");
  const [fatalError,setFatalError]=useState("");

  const lock=useRef(false);

  useEffect(()=>{
    account.get().then(u=>setUserId(u.$id));
  },[]);

  useEffect(()=>{
    if(!gameId || !userId) return;

    const load = async () => {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          gameId
        );

        const parsed = parseGame(g);

        if (!parsed.players.includes(userId)) {
          setFatalError("🚫 You are not part of this game");
          return;
        }

        if (!parsed.discard || !parsed.players.length) {
          setFatalError("⚠️ Game corrupted");
          return;
        }

        setGame(parsed);

      } catch (err) {
        if (err?.code === 404) setFatalError("❌ Game not found");
        else if (err?.code === 401) setFatalError("🔒 Permission denied");
        else setFatalError("⚠️ Failed to load game");
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res=>setGame(parseGame(res.payload))
    );

    return ()=>unsub();
  },[gameId,userId]);

  if (fatalError) {
    return (
      <div style={{padding:20,textAlign:"center",color:"red"}}>
        <h3>{fatalError}</h3>
        <button onClick={goHome}>Go Back</button>
      </div>
    );
  }

  if(!game || !userId) return <div>Loading game...</div>;

  const myIdx = game.players.indexOf(userId);
  if(myIdx === -1) return <div>Joining game...</div>;

  const oppIdx = myIdx===0?1:0;

  function showError(msg){
    setError(msg);
    beep(120,80);
    setTimeout(()=>setError(""),700);
  }

  async function safeFinishGame(g, winner){
    if(g.payoutDone) return;

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      { payoutDone:true }
    );

    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", g.players[winner])]
    );

    if(res.documents.length){
      const wallet = res.documents[0];
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance:Number(wallet.balance||0)+g.pot }
      );
    }

    g.status="finished";
    g.winnerId=g.players[winner];
    g.history.push(`Game finished - P${winner+1} won`);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      encodeGame(g)
    );

    const matchRes = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.equal("gameId",gameId)]
    );

    if(matchRes.documents.length){
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        matchRes.documents[0].$id,
        { status:"finished", winnerId:g.players[winner] }
      );
    }
  }
async function endRound(g, winner){
    g.scores[winner]++;
    g.history.push(`P${winner+1} won round ${g.round}`);

    if(g.scores[winner]===2){
      await safeFinishGame(g,winner);
      return;
    }

    const d=createDeck();
    g.hands=[d.splice(0,6),d.splice(0,6)];
    g.discard=d.pop();
    g.deck=d;
    g.round++;
    g.turn=g.players[0];

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      gameId,
      encodeGame(g)
    );
  }

  async function playCard(i){
    if(lock.current) return;

    if(game.turn!==userId){
      showError("Wait your turn");
      return;
    }

    lock.current=true;

    try{
      const g = JSON.parse(JSON.stringify(game));
      const card = g.hands[myIdx][i];
      const top = g.discard;

      if(g.pendingPick>0){
        showError("Pick first");
        return;
      }

      if(card[0]!==top[0] && card.slice(1)!==top.slice(1) && card.slice(1)!=="14"){
        showError("Invalid move");
        return;
      }

      g.hands[myIdx].splice(i,1);

      let next = g.players[oppIdx];
      const num = card.slice(1);

      let msg=`P${myIdx+1} played ${card}`;

      if(num==="1"){ next=g.players[myIdx]; }
      if(num==="2"){ g.pendingPick+=2; }
      if(num==="8"){ next=g.players[myIdx]; }
      if(num==="14"){ g.pendingPick+=1; }

      g.history.push(msg);

      if(!g.hands[myIdx].length){
        await endRound(g,myIdx);
        return;
      }

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        encodeGame({...g, discard:card, turn:next})
      );

    } finally {
      lock.current=false;
    }
  }

  async function draw(){
    if(lock.current) return;

    if(game.turn!==userId){
      showError("Wait your turn");
      return;
    }

    lock.current=true;

    try{
      const g = JSON.parse(JSON.stringify(game));

      if(!g.deck.length){
        const p1=g.hands[0].length;
        const p2=g.hands[1].length;

        if(p1===p2){
          const d=createDeck();
          g.hands=[d.splice(0,6),d.splice(0,6)];
          g.discard=d.pop();
          g.deck=d;
          g.round++;
          g.turn=g.players[0];
          await databases.updateDocument(DATABASE_ID,GAME_COLLECTION,gameId,encodeGame(g));
          return;
        }

        const win=p1<p2?0:1;
        await endRound(g,win);
        return;
      }

      const picks = g.pendingPick>0?g.pendingPick:1;

      for(let i=0;i<picks;i++){
        if(g.deck.length) g.hands[myIdx].push(g.deck.pop());
      }

      g.pendingPick=0;

      await databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        encodeGame({...g, turn:g.players[oppIdx]})
      );

    } finally {
      lock.current=false;
    }
  }

  const hand = game.hands[myIdx] || [];
  const oppCards = game.hands[oppIdx]?.length || 0;
  const isWinner = game.winnerId===userId;

  useEffect(()=>{
    if(game.status==="finished"){
      const t=setInterval(()=>{
        setCountdown(c=>{
          if(c<=1){ goHome(); return 0; }
          return c-1;
        });
      },1000);
      return ()=>clearInterval(t);
    }
  },[game.status]);

  return (
  <div style={{padding:10, background:"#063", minHeight:"100vh", color:"#fff"}}>

    <h2>🎮 WHOT GAME</h2>

    <div>
      Round {game.round}/3 | {game.scores[0]} - {game.scores[1]}
    </div>

    <div>💰 ₦{game.pot}</div>

    <div style={{textAlign:"center"}}>
      {game.turn===userId ? "🟢 YOUR TURN" : "⏳ OPPONENT"}
    </div>

    {error && <div style={{color:"red"}}>{error}</div>}

    <div style={{textAlign:"center"}}>
      {Array.from({length:oppCards}).map((_,i)=>(
        <img key={i} src={backCard} style={{width:40}}/>
      ))}
    </div>

    <div style={{textAlign:"center"}}>
      {game.discard && <img src={drawCard(game.discard)} style={{width:70}}/>}
      <button onClick={draw} disabled={game.turn!==userId}>
        🃏 {game.deck.length}
      </button>
    </div>

    <div>
      {(game.history||[]).slice(-7).map((h,i,arr)=>(
        <div key={i}>{i===arr.length-1?"👉 ":"• "}{h}</div>
      ))}
    </div>

    <div style={{display:"flex", flexWrap:"wrap"}}>
      {hand.map((c,i)=>(
        <img
          key={i}
          src={drawCard(c)}
          style={{width:65, opacity: game.turn!==userId ? 0.6 : 1}}
          onClick={()=>playCard(i)}
        />
      ))}
    </div>

    {game.status==="finished" && (
      <div style={{textAlign:"center"}}>
        <h3>{isWinner?"🏆 YOU WON":"❌ YOU LOST"}</h3>
        <p>{isWinner?`+₦${game.pot}`:`-₦${game.pot}`}</p>
        <p>Redirecting in {countdown}s...</p>
      </div>
    )}

    <button onClick={goHome}>Exit</button>

  </div>
  );
}