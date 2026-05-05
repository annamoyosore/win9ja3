import { useEffect, useState, useRef } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query,
  ID
} from "../lib/appwrite";

const CHAT_COLLECTION = "messages";

export default function Messages({ matchId, players = [], onClose }) {
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const endRef = useRef(null);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    account.get().then(u => setUserId(u.$id));
  }, []);

  // =========================
  // LABEL HELPER
  // =========================
  const getLabel = (sender) => {
    if (!players?.length) return "Player";

    const idx = players.indexOf(sender);
    if (idx === 0) return "Player 1";
    if (idx === 1) return "Player 2";

    return "Player";
  };

  // =========================
  // LOAD LAST 3 + REALTIME
  // =========================
  useEffect(() => {
    if (!matchId) return;

    const load = async () => {
      try {
        const res = await databases.listDocuments(
          DATABASE_ID,
          CHAT_COLLECTION,
          [
            Query.equal("matchId", matchId),
            Query.orderDesc("$createdAt"),
            Query.limit(3)
          ]
        );

        setMessages(res.documents.reverse());
      } catch (e) {
        console.error("Load messages failed:", e);
      }
    };

    load();

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${CHAT_COLLECTION}.documents`,
      (res) => {
        const m = res.payload;

        if (m.matchId !== matchId) return;

        setMessages(prev => {
          const exists = prev.find(x => x.$id === m.$id);
          if (exists) return prev;

          const updated = [...prev, m];
          return updated.slice(-3);
        });
      }
    );

    return () => unsub();
  }, [matchId]);

  // =========================
  // AUTO SCROLL
  // =========================
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =========================
  // SEND MESSAGE
  // =========================
  async function send() {
    const trimmed = text.trim();

    if (!trimmed) return;

    if (trimmed.length > 80) {
      setError("Message too long (max 80 chars)");
      setTimeout(() => setError(""), 1500);
      return;
    }

    if (!matchId || !userId) {
      console.warn("Missing matchId or userId");
      return;
    }

    try {
      await databases.createDocument(
        DATABASE_ID,
        CHAT_COLLECTION,
        ID.unique(),
        {
          matchId,
          sender: userId,
          text: trimmed
        }
      );

      setText("");
    } catch (e) {
      console.error("Send failed:", e);
    }
  }

  // =========================
  // CLOSE HANDLER
  // =========================
  function handleClose() {
    if (onClose) onClose();
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.box}>

        {/* 🔴 ERROR POPUP */}
        {error && <div style={styles.error}>{error}</div>}

        {/* HEADER */}
        <div style={styles.header}>
          <span>💬 Match Chat</span>
          <button onClick={handleClose}>✖</button>
        </div>

        {/* MESSAGES */}
        <div style={styles.chat}>
          {messages.map((m, i) => (
            <div
              key={m.$id || i}
              style={{
                textAlign: m.sender === userId ? "right" : "left",
                marginBottom: 6
              }}
            >
              <div style={{ fontSize: 10, opacity: 0.6 }}>
                {m.sender === userId
                  ? "You"
                  : getLabel(m.sender)}
              </div>

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

          <div ref={endRef} />
        </div>

        {/* INPUT */}
        <div style={styles.inputRow}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
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
  },
  error: {
    background: "red",
    padding: 6,
    textAlign: "center",
    marginBottom: 6,
    borderRadius: 6
  }
};