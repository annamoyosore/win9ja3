// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

import { lockFunds, unlockFunds } from "../lib/wallet";

const GAME_COLLECTION = "games";

// =========================
// AVATAR HELPER
// =========================
function getInitial(name, fallback = "U") {
  if (!name) return fallback;
  return name.charAt(0).toUpperCase();
}

// =========================
// COMPONENT
// =========================
export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loadingMatchId, setLoadingMatchId] = useState(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    refresh(u.$id);
  }

  // =========================
  // LOAD DATA
  // =========================
  async function refresh(userId) {
    await loadMatches(userId);
    await loadActiveMatches(userId);
  }

  // ✅ FIXED AVAILABLE MATCHES
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.equal("status", "waiting")]
    );

    const filtered = res.documents.filter(
      (m) =>
        (!m.opponentId || m.opponentId === "") &&
        m.hostId !== userId
    );

    // attach host names
    const enriched = await Promise.all(
      filtered.map(async (m) => {
        try {
          const w = await databases.listDocuments(
            DATABASE_ID,
            WALLET_COLLECTION,
            [Query.equal("userId", m.hostId)]
          );

          return {
            ...m,
            hostName: w.documents[0]?.name || "Player"
          };
        } catch {
          return { ...m, hostName: "Player" };
        }
      })
    );

    setMatches(enriched);
  }

  // ✅ FIXED ACTIVE MATCHES
  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION
    );

    const mine = res.documents.filter(
      (m) =>
        (m.hostId === userId || m.opponentId === userId) &&
        m.status !== "cancelled"
    );

    const enriched = await Promise.all(
      mine.map(async (m) => {
        try {
          const hostWallet = await databases.listDocuments(
            DATABASE_ID,
            WALLET_COLLECTION,
            [Query.equal("userId", m.hostId)]
          );

          const oppWallet = m.opponentId
            ? await databases.listDocuments(
                DATABASE_ID,
                WALLET_COLLECTION,
                [Query.equal("userId", m.opponentId)]
              )
            : null;

          return {
            ...m,
            hostName: hostWallet.documents[0]?.name || "Host",
            opponentName:
              oppWallet?.documents[0]?.name || "Waiting..."
          };
        } catch {
          return {
            ...m,
            hostName: "Host",
            opponentName: "Opponent"
          };
        }
      })
    );

    setActiveMatches(enriched);
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loadingMatchId) return;

    setLoadingMatchId(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) throw new Error("Taken");

      if ((wallet?.balance || 0) < fresh.stake) {
        throw new Error("Insufficient balance");
      }

      await lockFunds(user.$id, fresh.stake);

      const total = fresh.stake * 2;
      const adminCut = Math.floor(total * 0.1);

      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: total - adminCut
        }
      );

      const game = await databases.createDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        ID.unique(),
        {
          matchId: updated.$id,
          players: `${updated.hostId},${user.$id}`,
          status: "running"
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        updated.$id,
        { gameId: game.$id }
      );

      goGame(game.$id);

    } catch (err) {
      alert(err.message);
    }

    setLoadingMatchId(null);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      {/* ACTIVE */}
      <h3>🔥 Your Matches</h3>

      {activeMatches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <div style={styles.playerRow}>
            <div style={styles.avatar}>
              {getInitial(m.hostName)}
            </div>
            <span>{m.hostName}</span>

            <span>VS</span>

            <div style={styles.avatar}>
              {getInitial(m.opponentName)}
            </div>
            <span>{m.opponentName}</span>
          </div>

          <p>₦{m.stake}</p>

          <button
            onClick={() => goGame(m.gameId)}
            style={styles.playBtn}
          >
            ▶ Play
          </button>
        </div>
      ))}

      {/* AVAILABLE */}
      <h3>🎯 Available Matches</h3>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <div style={styles.playerRow}>
            <div style={styles.avatar}>
              {getInitial(m.hostName)}
            </div>
            <span>{m.hostName}</span>
          </div>

          <p>₦{m.stake}</p>

          <button
            onClick={() => joinMatch(m)}
            style={styles.joinBtn}
          >
            Join
          </button>
        </div>
      ))}

      <button onClick={back} style={styles.back}>
        ← Back
      </button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    background: "#020617",
    color: "#fff",
    minHeight: "100vh"
  },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "gold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#000",
    fontWeight: "bold"
  },
  joinBtn: {
    marginTop: 10,
    background: "gold",
    padding: 8
  },
  playBtn: {
    marginTop: 10,
    background: "green",
    color: "#fff",
    padding: 8
  },
  back: {
    marginTop: 20,
    padding: 10
  }
};