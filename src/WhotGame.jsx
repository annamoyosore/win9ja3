import { useEffect, useRef, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query
} from "./lib/appwrite";

const GAME_COLLECTION = "games";
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";
const CHAT_COLLECTION = "messages";

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

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {}
}

// =========================
// 🎴 SAFE PARSER (OLD + NEW)
// =========================
function parseGame(g) {
  const players =
    typeof g.players === "string"
      ? g.players.split(",")
      : g.players || [];

  const handsRaw =
    typeof g.hands === "string"
      ? g.hands.split("|")
      : ["", ""];

  const hands = handsRaw.map(p =>
    p ? p.split(",").filter(Boolean) : []
  );

  const deck =
    typeof g.deck === "string"
      ? g.deck.split(",").filter(Boolean)
      : [];

  return {
    ...g,
    players,
    hands: hands.length === 2 ? hands : [[], []],
    deck,
    discard: g.discard || null,
    turn: g.turn || null,
    pendingPick: Number(g.pendingPick || 0),
    history: g.history ? g.history.split("||").filter(Boolean) : [],
    scores: g.scores?.split(",").map(Number) || [0, 0],
    round: Number(g.round || 1),
    status: g.status || "playing",
    payoutDone: Boolean(g.payoutDone),
    hostName: g.hostName || "Player 1",
    opponentName: g.opponentName || "Player 2",
    winnerId: g.winnerId || null,
    matchId: g.matchId || null
  };
}

// =========================
// COMPONENT
// =========================
export default function WhotGame({ gameId, goHome }) {
  const [game, setGame] = useState(null);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");
  const [unread, setUnread] = useState(false);

  const payoutRef = useRef(false);

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD GAME
  // =========================
  useEffect(() => {
    if (!gameId || !userId) return;

    const load = async () => {
      const g = await databases.getDocument(DATABASE_ID, GAME_COLLECTION, gameId);
      setGame(parseGame(g));

      if (g.matchId) {
        const m = await databases.getDocument(DATABASE_ID, MATCH_COLLECTION, g.matchId);
        setMatch(m);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents.${gameId}`,
      async (res) => {
        const parsed = parseGame(res.payload);
        setGame(parsed);

        // ===== FINISH + PAYOUT =====
        if (parsed.status === "finished") {
          setTimeout(goHome, 2500);

          if (parsed.winnerId !== userId) return;
          if (payoutRef.current) return;

          payoutRef.current = true;

          const fresh = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            parsed.$id
          );

          if (fresh.payoutDone) return;

          const pot = Number(fresh.pot || 0);

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
              { balance: Number(w.balance || 0) + pot }
            );
          }
        }
      }
    );

    return () => unsub();
  }, [gameId, userId]);

  // =========================
  // CHAT SYSTEM
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const load = async () => {
      const res = await databases.listDocuments(
        DATABASE_ID,
        CHAT_COLLECTION,
        [
          Query.equal("gameId", gameId),
          Query.orderAsc("$createdAt")
        ]
      );

      setMessages(res.documents);

      if (!chatOpen && res.documents.length) {
        const last = res.documents[res.documents.length - 1];
        if (last.sender !== userId) setUnread(true);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${CHAT_COLLECTION}.documents`,
      (res) => {
        if (res.payload.gameId !== gameId) return;

        setMessages(prev => [...prev, res.payload]);

        if (!chatOpen && res.payload.sender !== userId) {
          setUnread(true);
        }
      }
    );

    return () => unsub();
  }, [gameId, chatOpen]);

  async function sendMsg() {
    if (!msg.trim()) return;

    await databases.createDocument(
      DATABASE_ID,
      CHAT_COLLECTION,
      "unique()",
      {
        gameId,
        sender: userId,
        text: msg
      }
    );

    setMsg("");
  }

  if (!game) return <div>Loading...</div>;

  const myIdx = game.players.indexOf(userId);

  // =========================
  // END GAME RULE (FIRST TO 2)
  // =========================
  useEffect(() => {
    if (!game) return;

    if (game.scores[0] === 2 || game.scores[1] === 2) {
      const winnerIdx = game.scores[0] === 2 ? 0 : 1;

      databases.updateDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        gameId,
        {
          status: "finished",
          winnerId: game.players[winnerIdx]
        }
      );
    }
  }, [game]);

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        <h2>🎮 WHOT GAME</h2>

        {/* CHAT BUTTON */}
        <button
          onClick={() => {
            setChatOpen(!chatOpen);
            setUnread(false);
          }}
        >
          💬 Chat {unread && "🔴"}
        </button>

        {/* CHAT POPUP */}
        {chatOpen && (
          <div style={styles.chat}>
            <div style={styles.chatBox}>
              {messages.map((m, i) => (
                <div key={i}>
                  {m.sender === userId ? "🟢" : "🔵"} {m.text}
                </div>
              ))}
            </div>

            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />
            <button onClick={sendMsg}>Send</button>
          </div>
        )}

        <button onClick={goHome}>Exit</button>
      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  bg: {
    minHeight: "100vh",
    background: "green",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  box: {
    width: "95%",
    maxWidth: 450,
    background: "#000000cc",
    padding: 12,
    color: "#fff",
    borderRadius: 10
  },
  chat: {
    background: "#111",
    padding: 10,
    marginTop: 10
  },
  chatBox: {
    maxHeight: 120,
    overflow: "auto",
    fontSize: 12
  }
};