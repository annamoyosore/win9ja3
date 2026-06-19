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

// =========================
// ZANGI CHAT HELPER
// =========================
function openZangi(contact) {
  if (!contact) {
    alert("This user has no Zangi contact");
    return;
  }

  const link = `https://services.zangi.com/dl/conversation/${contact}`;
  window.open(link, "_blank");
}

// =========================
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

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  const notifiedTurns = useRef({});

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

    await refresh(u.$id);
  }

  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => refresh(user.$id)
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await Promise.all([
      loadMatches(userId),
      loadActiveMatches(userId)
    ]);
  }

  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    setMatches(
      res.documents.filter(
        (m) =>
          m.status === "waiting" &&
          !m.opponentId &&
          m.hostId !== userId
      )
    );
  }

  // =========================
  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    const mine = res.documents.filter(
      (m) => m.hostId === userId || m.opponentId === userId
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

  // =========================
  function canPlayMore() {
    return activeMatches.filter(m => m.status !== "finished").length < 7;
  }

  // =========================
  async function joinMatch(match) {
    if (loadingJoin) return;

    setLoadingJoin(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if ((wallet?.balance || 0) < fresh.stake) {
        throw new Error("Insufficient balance");
      }

      // deduct wallet
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - fresh.stake
        }
      );

      const total = fresh.pot + fresh.stake;
      const adminCut = Math.floor(total * 0.1);
      const finalPot = total - adminCut;

      const adminRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID), Query.limit(1)]
      );

      if (adminRes.documents.length) {
        const adminWallet = adminRes.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.$id,
          {
            balance: Number(adminWallet.balance || 0) + adminCut
          }
        );
      }

      const opponentZangi = wallet?.zangiContact || "";

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          opponentZangi,
          status: "matched",
          pot: finalPot
        }
      );

      const game = await createGame(fresh, user.$id);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          gameId: game.$id
        }
      );

      goGame(game.$id, fresh.stake);

    } catch (err) {
      alert(err.message);
    }

    setLoadingJoin(null);
  }

  // =========================
  async function createMatch() {
    if (creating) return;

    const amount = Number(stake);
    if (!amount || amount < 50) return;

    setCreating(true);

    try {
      const hostZangi = wallet?.zangiContact || "";

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: wallet.balance - amount
        }
      );

      await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          hostZangi,
          opponentId: null,
          opponentZangi: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          refundDone: false
        }
      );

      setStake("");

    } catch (err) {
      alert(err.message);
    }

    setCreating(false);
  }

  // ========================= UI =========================
  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      <h2>🔥 Active Matches</h2>

      {activeMatches.map((m) => {
        const game = gameMap[m.gameId];

        const opponentZangi =
          m.hostId === user.$id ? m.opponentZangi : m.hostZangi;

        return (
          <div key={m.$id} style={styles.card}>
            <div>
              <p>₦{m.stake}</p>
              <p>{m.status}</p>

              <p>Host Zangi: {m.hostZangi || "N/A"}</p>
              <p>Opponent Zangi: {m.opponentZangi || "Waiting..."}</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {m.gameId && (
                <button
                  style={styles.resumeBtn}
                  onClick={() => goGame(m.gameId, m.stake)}
                >
                  ▶ Resume
                </button>
              )}

              {/* 💬 CHAT BUTTON */}
              <button
                style={styles.chatBtn}
                onClick={() => openZangi(opponentZangi)}
              >
                💬 Chat
              </button>
            </div>
          </div>
        );
      })}

      <h2>Available Matches</h2>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button onClick={() => joinMatch(m)} style={styles.joinBtn}>
            Join
          </button>
        </div>
      ))}

      <input
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake"
      />

      <button onClick={createMatch} disabled={creating}>
        Create Match
      </button>

      <button onClick={back}>Back</button>
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
    padding: 12,
    margin: 10,
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  joinBtn: {
    background: "gold",
    padding: 10,
    border: "none",
    borderRadius: 8
  },

  resumeBtn: {
    background: "#16a34a",
    padding: 10,
    border: "none",
    color: "#fff",
    borderRadius: 8
  },

  chatBtn: {
    background: "#2563eb",
    padding: 10,
    border: "none",
    color: "#fff",
    borderRadius: 8,
    cursor: "pointer"
  }
};