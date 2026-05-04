import { useEffect, useState, useRef } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  ID,
  Query
} from "./lib/appwrite";

const CHAT_COLLECTION = "game_messages"; // create this in Appwrite

export default function Message({ gameId, goBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [userId, setUserId] = useState(null);

  const bottomRef = useRef();

  // =========================
  // GET USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD MESSAGES
  // =========================
  useEffect(() => {
    if (!gameId) return;

    const load = async () => {
      const res = await databases.listDocuments(
        DATABASE_ID,
        CHAT_COLLECTION,
        [
          Query.equal("gameId", gameId),
          Query.orderAsc("$createdAt"),
          Query.limit(100)
        ]
      );

      setMessages(res.documents);
    };

    load();

    // 🔴 REALTIME
    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${CHAT_COLLECTION}.documents`,
      (res) => {
        const msg = res.payload;

        if (msg.gameId !== gameId) return;

        setMessages(prev => [...prev, msg]);
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // AUTO SCROLL
  // =========================
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =========================
  // SEND MESSAGE
  // =========================
  async function sendMessage() {
    if (!text.trim()) return;

    const msg = text.trim();
    setText("");

    try {
      await databases.createDocument(
        DATABASE_ID,
        CHAT_COLLECTION,
        ID.unique(),
        {
          gameId,
          userId,
          text: msg
        }
      );
    } catch (e) {
      console.log("send error", e);
    }
  }

  return (
    <div style={styles.bg}>
      <div style={styles.box}>
        
        {/* HEADER */}
        <div style={styles.header}>
          <button onClick={goBack} style={styles.backBtn}>←</button>
          <span>Game Chat</span>
        </div>

        {/* CHAT BODY */}
        <div style={styles.chat}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={
                m.userId === userId
                  ? styles.myMsg
                  : styles.otherMsg
              }
            >
              {m.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* INPUT */}
        <div style={styles.inputBox}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type message..."
            style={styles.input}
          />
          <button onClick={sendMessage} style={styles.sendBtn}>
            Send
          </button>
        </div>

      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  bg: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "#000",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  box: {
    width: "100%",
    maxWidth: 450,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#111",
    color: "#fff"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottom: "1px solid #333"
  },
  backBtn: {
    background: "gold",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6
  },
  chat: {
    flex: 1,
    overflowY: "auto",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  myMsg: {
    alignSelf: "flex-end",
    background: "gold",
    color: "#000",
    padding: 8,
    borderRadius: 8,
    maxWidth: "70%"
  },
  otherMsg: {
    alignSelf: "flex-start",
    background: "#333",
    padding: 8,
    borderRadius: 8,
    maxWidth: "70%"
  },
  inputBox: {
    display: "flex",
    gap: 6,
    padding: 10,
    borderTop: "1px solid #333"
  },
  input: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    border: "none"
  },
  sendBtn: {
    background: "gold",
    border: "none",
    padding: "8px 12px",
    borderRadius: 6
  }
};