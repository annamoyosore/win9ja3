import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query,
  ID
} from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";
const CHAT_COLLECTION = "chats";

// =========================
// 🔊 SOUND
// =========================
function beep(freq = 200, duration = 200) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
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

// =========================
// 🎴 DECK
// =========================
function createDeck() {
  const valid = {
    c: [1,2,3,4,5,7,8,10,11,12,13,14],
    t: [1,2,3,4,5,7,8,10,11,12,13,14],
    s: [1,2,3,5,7,10,11,13,14],
    x: [1,2,3,5,7,10,11,13,14],
    r: [1,2,3,4,5,7,8]
  };

  let deck = [];
  Object.keys(valid).forEach(shape => {
    valid[shape].forEach(n => deck.push(shape + n));
  });

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// 🎴 DECODE
// =========================
function decodeCard(str) {
  if (!str) return null;

  const map = {
    c: "circle",
    t: "triangle",
    s: "square",
    r: "star",
    x: "cross"
  };

  return {
    shape: map[str[0]],
    number: Number(str.slice(1))
  };
}

// =========================
// 🎴 DRAW CARD
// =========================
const cache = new Map();

function drawCard(card) {
  if (!card) return null;

  const key = `${card.shape}_${card.number}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement("canvas");
  c.width = 70;
  c.height = 100;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 70, 100);

  ctx.strokeStyle = "#e11d48";
  ctx.strokeRect(2, 2, 66, 96);

  ctx.fillStyle = "#e11d48";
  ctx.fillText(card.number, 6, 18);

  const cx = 35, cy = 55;

  if (card.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.shape === "square") ctx.fillRect(cx - 12, cy - 12, 24, 24);

  if (card.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.fill();
  }

  const img = c.toDataURL();
  cache.set(key, img);
  return img;
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {

  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState(false);

  const payoutRef = useRef(false);
  const actionLock = useRef(false);

  // =========================
  // 👤 USER LOAD
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // ⚡ FAST GAME LOAD
  // =========================
  useEffect(() => {
    if (!gameId) return;

    databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId)
      .then(g => setGame(g));

    databases.getDocument(DATABASE_ID, MATCH_COLLECTION, gameId)
      .then(m => setMatch(m))
      .catch(()=>{});
  }, [gameId]);

  // =========================
  // 💬 CHAT SUBSCRIBE (OPTIMIZED)
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${CHAT_COLLECTION}.documents`,
      (res) => {
        const msg = res.payload;
        if (msg.gameId !== gameId) return;

        if (!chatOpen) setUnread(c => c + 1);

        setMessages(prev => [...prev, msg].slice(-4));
      }
    );

    return () => unsub();
  }, [gameId, chatOpen]);

  // =========================
  // 💬 SEND MESSAGE + AUTO CLEAN
  // =========================
  async function sendMessage() {
    if (!text.trim() || muted) return;

    if (messages.length >= 4) {
      for (let m of messages) {
        databases.deleteDocument(
          DATABASE_ID,
          CHAT_COLLECTION,
          m.$id
        );
      }
      setMessages([]);
    }

    await databases.createDocument(
      DATABASE_ID,
      CHAT_COLLECTION,
      ID.unique(),
      { gameId, sender: userId, text }
    );

    setText("");
  }

  // =========================
  // 💰 PAYOUT (POT ONLY SAFE)
  // =========================
  async function handlePayout(parsed) {
    if (parsed.winnerId !== userId) return;
    if (payoutRef.current) return;

    payoutRef.current = true;

    const fresh = await databases.getDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      parsed.$id
    );

    if (fresh.payoutDone) return;

    const total = Number(fresh.pot || 0);

    await databases.updateDocument(
      DATABASE_ID,
      GAME_COLLECTION,
      parsed.$id,
      { payoutDone: true, pot: 0 }
    );

    const wallet = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", parsed.winnerId)]
    );

    if (wallet.documents.length) {
      const w = wallet.documents[0];

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        w.$id,
        { balance: Number(w.balance || 0) + total }
      );
    }
  }

  if (!game || !userId) return <div>Loading...</div>;

  // =========================
  // 🎮 GAME STATE
  // =========================
  const myIdx = game.players?.indexOf(userId);
  const oppIdx = myIdx === 0 ? 1 : 0;

  const hand = game.hands?.[myIdx] || [];
  const oppCards = game.hands?.[oppIdx]?.length || 0;
  const top = game.discard ? decodeCard(game.discard) : null;

  const myName = myIdx === 0 ? game.hostName : game.opponentName;
  const oppName = myIdx === 0 ? game.opponentName : game.hostName;

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        <div style={styles.row}>
          <span>{myName}</span>
          <span>VS</span>
          <span>{oppName}</span>
        </div>

        <div style={{ textAlign: "center" }}>
          {Array.from({ length: oppCards }).map((_, i) => (
            <img key={i} src={drawCard({shape:"circle",number:0})} style={{ width: 40 }} />
          ))}
        </div>

        <div style={styles.center}>
          {top && <img src={drawCard(top)} style={styles.card} />}
        </div>

        <button onClick={goHome}>Exit</button>
      </div>

      {/* CHAT BUTTON */}
      <div onClick={()=>{setChatOpen(true);setUnread(0);}}
        style={styles.chatBtn}>
        💬 {unread > 0 && <span style={styles.badge}>{unread}</span>}
      </div>

      {/* CHAT BOX */}
      {chatOpen && (
        <div style={styles.chatBox}>
          <button onClick={()=>setChatOpen(false)}>X</button>

          {messages.map(m => (
            <div key={m.$id}>
              {m.sender === userId ? "You" : "Opponent"}: {m.text}
            </div>
          ))}

          <input value={text} onChange={e=>setText(e.target.value)} />
          <button onClick={sendMessage}>Send</button>
          <button onClick={()=>setMuted(!muted)}>
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      )}
    </div>
  );
}

// =========================
// 🎨 STYLES (UNCHANGED)
// =========================
const styles = {
  bg:{minHeight:"100vh",background:"green",display:"flex",justifyContent:"center",alignItems:"center"},
  box:{width:"95%",maxWidth:450,background:"#000000cc",padding:12,color:"#fff",borderRadius:10},
  row:{display:"flex",justifyContent:"space-between"},
  center:{display:"flex",justifyContent:"center",marginTop:10},
  card:{width:65},
  chatBtn:{position:"fixed",bottom:20,right:20,background:"#000",color:"#fff",padding:12,borderRadius:"50%",cursor:"pointer"},
  badge:{background:"red",borderRadius:"50%",padding:"2px 6px",fontSize:10},
  chatBox:{position:"fixed",bottom:80,right:20,width:250,background:"#fff",padding:10}
};