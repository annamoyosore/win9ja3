import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query,
  ID
} from "../lib/appwrite";

const CHAT_COLLECTION = "messages";

export default function Messages({ gameId, onClose }) {
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LOAD + REALTIME
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
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${CHAT_COLLECTION}.documents`,
      (res) => {
        if (res.payload.gameId !== gameId) return;
        setMessages(prev => [...prev, res.payload]);
      }
    );

    return () => unsub();
  }, [gameId]);

  // =========================
  // SEND MESSAGE
  // =========================
  async function send() {
    if (!text.trim()) return;

    await databases.createDocument(
      DATABASE_ID,
      CHAT_COLLECTION,
      ID.unique(),
      {
        gameId,
        sender: userId,
        text
      }
    );

    setText("");
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.box}>

        {/* HEADER */}
        <div style={styles.header}>
          <span>💬 Game Chat</span>
          <button onClick={onClose}>✖</button>
        </div>

        {/* MESSAGES */}
        <div style={styles.chat}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                textAlign: m.sender === userId ? "right" : "left",
                marginBottom: 6
              }}
            >
              <span
                style={{
                  background: m.sender === userId ? "#16a34a" : "#2563eb",
                  padding: "6px 10px",
                  borderRadius: 8,
                  display: "inline-block"
                }}
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>

        {/* INPUT */}
        <div style={styles.inputRow}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type message..."
            style={styles.input}
          />
          <button onClick={send}>Send</button>
        </div>

      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#000000aa",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999
  },
  box: {
    width: "95%",
    maxWidth: 400,
    background: "#111",
    borderRadius: 10,
    padding: 10,
    color: "#fff"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 10
  },
  chat: {
    maxHeight: 250,
    overflow: "auto",
    marginBottom: 10
  },
  inputRow: {
    display: "flex",
    gap: 5
  },
  input: {
    flex: 1,
    padding: 6
  }
};