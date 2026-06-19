import { useEffect, useRef, useState } from "react";
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

/* =========================
   GAME CREATION
========================= */

async function createGame(match, opponentId) {
  return await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: `${match.hostId},${opponentId}`,
      status: "running",
      turn: match.hostId,
      payoutDone: false
    }
  );
}

/* =========================
   ZANGI FIX
========================= */

function getOpponentZangi(match, userId) {
  if (!match || !userId) return null;

  if (match.hostId === userId) {
    return match.opponentZangiContact || null;
  }

  if (match.opponentId === userId) {
    return match.hostZangiContact || null;
  }

  return null;
}

/* =========================
   UI STYLES
========================= */

const styles = {
  container: {
    padding: 20,
    background: "linear-gradient(180deg,#020617,#0f172a)",
    color: "#fff",
    minHeight: "100vh",
    fontFamily: "system-ui"
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10
  },

  section: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: "600",
    color: "#cbd5e1"
  },

  card: {
    background: "#111827",
    padding: 14,
    margin: "12px 0",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.05)"
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  stake: {
    fontSize: 16,
    fontWeight: "bold"
  },

  status: {
    fontSize: 12,
    opacity: 0.7
  },

  turn: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "bold",
    color: "#facc15"
  },

  btn: {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: "bold",
    marginTop: 8
  },

  chatBtn: {
    background: "#2563eb",
    color: "#fff"
  },

  resumeBtn: {
    background: "#16a34a",
    color: "#fff"
  },

  joinBtn: {
    background: "gold",
    color: "#000",
    padding: "8px 14px",
    borderRadius: 10,
    border: "none",
    fontWeight: "bold"
  },

  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
    marginTop: 10
  },

  createBtn: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    background: "#f59e0b",
    border: "none",
    fontWeight: "bold",
    marginTop: 10
  }
};

/* =========================
   LOBBY
========================= */

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    refresh(u.$id);
  }

  async function refresh(userId) {
    await Promise.all([loadMatches(userId), loadActiveMatches(userId)]);
  }

  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    setMatches(
      res.documents.filter(
        m => m.status === "waiting" && !m.opponentId && m.hostId !== userId
      )
    );
  }

  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100), Query.orderDesc("$createdAt")]
    );

    const mine = res.documents.filter(
      m => m.hostId === userId || m.opponentId === userId
    );

    setActiveMatches(mine);

    const map = {};
    await Promise.all(
      mine.map(async (m) => {
        if (!m.gameId) return;
        try {
          const g = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            m.gameId
          );
          map[m.gameId] = g;
        } catch {}
      })
    );

    setGameMap(map);
  }

  /* =========================
     CHAT FIX (NO DEAD CLICK)
========================= */

  function openZangi(match) {
    const zangi = getOpponentZangi(match, user.$id);

    console.log("ZANGI:", zangi);

    if (!zangi) {
      alert("Opponent Zangi not available");
      return;
    }

    navigator.clipboard.writeText(zangi);
    alert("Copied ✔ Opening chat...");

    window.location.href =
      `zangi://chat?number=${encodeURIComponent(zangi)}`;

    setTimeout(() => {
      window.open("https://services.zangi.com/dl/conversation/", "_blank");
    }, 1500);
  }

  async function createMatch() {
    const amount = Number(stake);
    if (!amount || amount < 50) return alert("Minimum ₦50");

    setCreating(true);

    try {
      await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          refundDone: false,
          hostZangiContact: wallet?.zangiContact || ""
        }
      );

      setStake("");
    } catch (err) {
      alert(err.message);
    }

    setCreating(false);
  }

  async function joinMatch(match) {
    if (loadingJoin) return;
    setLoadingJoin(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          opponentZangiContact: wallet?.zangiContact || ""
        }
      );

      const game = await createGame(fresh, user.$id);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        { gameId: game.$id }
      );

      goGame(game.$id, fresh.stake);
    } catch (err) {
      alert(err.message);
    }

    setLoadingJoin(null);
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎮 Lobby</h1>

      <div style={styles.section}>🔥 Active Matches</div>

      {activeMatches.map(m => {
        const game = gameMap[m.gameId];

        const turnLabel =
          game && game.status !== "finished"
            ? game.turn === user.$id
              ? "🟢 Your Turn"
              : "🔴 Opponent Turn"
            : "";

        return (
          <div key={m.$id} style={styles.card}>
            <div style={styles.row}>
              <span style={styles.stake}>₦{m.stake}</span>
              <span style={styles.status}>{m.status}</span>
            </div>

            {turnLabel && <div style={styles.turn}>{turnLabel}</div>}

            <button
              style={{ ...styles.btn, ...styles.chatBtn }}
              onClick={() => openZangi(m)}
            >
              💬 Chat Opponent
            </button>

            {m.gameId && (
              <button
                style={{ ...styles.btn, ...styles.resumeBtn }}
                onClick={() => goGame(m.gameId, m.stake)}
              >
                ▶ Resume
              </button>
            )}
          </div>
        );
      })}

      <div style={styles.section}>🎯 Available Matches</div>

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <div style={styles.row}>
            <span>₦{m.stake}</span>

            <button
              style={styles.joinBtn}
              onClick={() => joinMatch(m)}
            >
              Join
            </button>
          </div>
        </div>
      ))}

      <input
        style={styles.input}
        type="number"
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="Stake"
      />

      <button
        style={styles.createBtn}
        onClick={createMatch}
      >
        {creating ? "Creating..." : "Create Match"}
      </button>

      <button
        style={{ ...styles.btn, background: "#334155", marginTop: 10 }}
        onClick={back}
      >
        Back
      </button>
    </div>
  );
}