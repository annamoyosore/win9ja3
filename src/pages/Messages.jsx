import { useEffect, useState } from "react";
import {
  databases,
  DATABASE_ID,
  account,
  Query,
  ID
} from "../lib/appwrite";

const CHAT_COLLECTION = "messages";
const GAME_COLLECTION = "games";

export default function Messages({ matchId, onClose }) {
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
          const updated = [...prev, m];
          return updated.slice(-3); // keep last 3
        });
      }
    );

    return () => unsub();
  }, [matchId]);

  // =========================
  // TRIM CHAT WHEN GAME ENDS
  // =========================
  useEffect(() => {
    if (!matchId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents`,
      async (res) => {
        const g = res.payload;

        if (g.matchId !== matchId) return;

        if (g.status === "finished") {
          try {
            const msgs = await databases.listDocuments(
              DATABASE_ID,
              CHAT_COLLECTION,
              [
                Query.equal("matchId", matchId),
                Query.orderDesc("$createdAt")
              ]
            );

            const toDelete = msgs.documents.slice(3); // keep last 3

            await Promise.all(
              toDelete.map(m =>
                databases.deleteDocument(
                  DATABASE_ID,
                  CHAT_COLLECTION,
                  m.$id
                )
              )
            );

          } catch (e) {
            console.error("Chat trim failed:", e);
          }
        }
      }
    );

    return () => unsub();
  }, [matchId]);

  // =========================
  // SEND MESSAGE
  // =========================
  async function send() {
    if (!text.trim() || !userId) return;

    try {
      await databases.createDocument(
        DATABASE_ID,
        CHAT_COLLECTION,
        ID.unique(),
        {
          matchId,
          sender: userId,
          text
        }
      );

      setText("");
    } catch (e) {
      console.error("Send failed:", e);
    }
  }

  return (
    <div
      style={styles.overlay}
      onClick={() => onClose?.()} // 👈 click outside closes
    >
      <div
        style={styles.box}
        onClick={(e) => e.stopPropagation()} // 👈 prevent close inside
      >

        {/* HEADER */}
        <div style={styles.header}>
          <span>💬 Match Chat</span>
          <button onClick={() => onClose?.()}>✖</button>
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