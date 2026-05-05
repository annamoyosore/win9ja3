import { useEffect, useRef, useState } from "react";
import { databases, DATABASE_ID, account } from "./lib/appwrite";

const GAME_COLLECTION = "games";

// 🔊 SOUND
function beep(freq = 200, duration = 120) {
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

// 🎴 SAFE PARSE
function parseGame(g){
  if(!g) return null;

  const safe=(v,s)=>typeof v==="string"?v.split(s).filter(Boolean):[];

  let players = Array.isArray(g.players)?g.players:safe(g.players,",");

  if(players.length < 2){
    return { ...g, players, status:"waiting" };
  }

  return {
    ...g,
    players,
    hands: safe(g.hands,"|").map(p=>safe(p,",")) || [[],[]],
    deck: safe(g.deck,","),
    discard: g.discard,
    scores: safe(g.scores,",").map(Number) || [0,0],
    round: Number(g.round||1),
    status: g.status||"playing",
    pot: Number(g.pot||0)
  };
}
export default function WhotGame({gameId, goHome}) {

  const [game,setGame]=useState(null);
  const [userId,setUserId]=useState(null);
  const [error,setError]=useState("");
  const [countdown,setCountdown]=useState(5);

  const lock=useRef(false);

  // 👤 LOAD USER
  useEffect(()=>{
    account.get()
      .then(u=>setUserId(u.$id))
      .catch(()=>setError("Failed to get user"));
  },[]);

  // 🎮 LOAD GAME
  useEffect(()=>{
    if(!gameId || !userId) return;

    const load=async()=>{
      try{
        const g = await databases.getDocument(DATABASE_ID,GAME_COLLECTION,gameId);
        setGame(parseGame(g));
      }catch(e){
        console.log(e);
        setError("Game failed to load");
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      res=>{
        try{
          setGame(parseGame(res.payload));
        }catch{
          setError("Realtime update failed");
        }
      }
    );

    return ()=>unsub();
  },[gameId,userId]);

  // ✅ SAFE INDEX (ONLY ONCE)
  const myIdx = game?.players?.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;
// ⛔ SAFE RETURNS
  if(error){
    return <div style={{color:"red"}}>{error}</div>;
  }

  if(!game || !userId){
    return <div>Loading game...</div>;
  }

  if(myIdx === -1){
    return <div>Joining game...</div>;
  }

  const hand = game.hands?.[myIdx] || [];
  const oppCards = game.hands?.[oppIdx]?.length || 0;
  const isWinner = game.winnerId === userId;

  // ⏳ REDIRECT TIMER
  useEffect(()=>{
    if(game.status==="finished"){
      const t=setInterval(()=>{
        setCountdown(c=>{
          if(c<=1){
            goHome();
            return 0;
          }
          return c-1;
        });
      },1000);
      return ()=>clearInterval(t);
    }
  },[game.status]);

  return (
    <div style={{padding:10, background:"#063", minHeight:"100vh", color:"#fff"}}>

      <h2>🎮 WHOT GAME</h2>

      <div>Round {game.round}/3 | {game.scores?.[0]} - {game.scores?.[1]}</div>
      <div>💰 ₦{game.pot}</div>

      <div style={{textAlign:"center"}}>
        Opponent Cards: {oppCards}
      </div>

      <div style={{marginTop:10}}>
        Your Cards: {hand.length}
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