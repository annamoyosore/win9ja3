import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

const GAME_COLLECTION = "games";
const ADMIN_ID = "69ef9fe863a02a7490b4";

export default function Lobby() {
  // =========================
  // STATE
  // =========================
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // ✅ FIXED: only ONE declaration (this was your deploy error)
  const [zangiMap, setZangiMap] = useState({});

  const isMounted = useRef(true);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    async function init() {
      try {
        const u = await account.get();
        if (isMounted.current) setUser(u);
        await loadActiveMatches(u.$id);
      } catch (err) {
        console.log("User not logged in:", err);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    }

    init();

    return () => {
      isMounted.current = false;
    };
  }, []);

  // =========================
  // LOAD MATCHES
  // =========================
  async function loadActiveMatches(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [Query.limit(50)]
      );

      if (isMounted.current) {
        setMatches(res.documents || []);
      }
    } catch (err) {
      console.log("Failed to load matches:", err);
    }
  }

  // =========================
  // CREATE MATCH (placeholder safe)
  // =========================
  async function createMatch() {
    setCreating(true);

    try {
      // Example safe structure (adjust to your DB schema)
      const doc = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          status: "open",
          createdAt: new Date().toISOString()
        }
      );

      setMatches((prev) => [doc, ...prev]);
    } catch (err) {
      console.log("Create match error:", err);
    } finally {
      setCreating(false);
    }
  }

  // =========================
  // UI
  // =========================
  if (loading) {
    return (
      <div style={{ padding: 20, color: "#fff", background: "#020617", minHeight: "100vh" }}>
        Loading Lobby...
      </div>
    );
  }

  return (
    <div style={{ padding: 20, background: "#020617", color: "#fff", minHeight: "100vh" }}>
      <h2>Game Lobby</h2>

      <button
        onClick={createMatch}
        disabled={creating}
        style={{
          background: "red",
          padding: "12px 18px",
          borderRadius: 10,
          color: "#fff",
          border: "none",
          fontWeight: "bold",
          marginBottom: 20
        }}
      >
        {creating ? "Creating..." : "Create Match"}
      </button>

      <div>
        {matches.length === 0 ? (
          <p>No active matches</p>
        ) : (
          matches.map((m) => (
            <div
              key={m.$id}
              style={{
                background: "#111827",
                padding: 12,
                margin: "10px 0",
                display: "flex",
                justifyContent: "space-between",
                borderRadius: 12
              }}
            >
              <span>Match ID: {m.$id}</span>
              <button
                style={{
                  background: "gold",
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: "bold"
                }}
              >
                Join
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}