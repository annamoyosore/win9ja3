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
function playTurnSound() {
  try {
    const ctx =
      new (window.AudioContext || window.webkitAudioContext)();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";

    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.setValueAtTime(980, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(620, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);

  } catch (err) {
    console.log("Sound failed");
  }
}

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

// ✅ ZANGI URL BUILDER (ADDED)
function buildZangiUrl(id) {
  if (!id) return "";
  return `https://services.zangi.com/dl/conversation/${id}`;
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

    if ("Notification" in window) {
      Notification.requestPermission();
    }

    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    await autoRefundExpiredMatches(u.$id);
    refresh(u.$id);
  }

  async function refresh(userId) {
    await Promise.all([
      loadMatches(userId),
      loadActiveMatches(userId)
    ]);
  }

  // =========================
  // CREATE MATCH (ONLY ADDITION: hostZangiContact)
  // =========================
  async function createMatch() {
    if (creating) return;

    if (!canPlayMore()) {
      return alert("Max 7 running matches");
    }

    const amount = Number(stake);

    if (!amount || amount < 50) {
      return alert("Minimum ₦50");
    }

    if ((wallet?.balance || 0) < amount) {
      return alert("Insufficient balance");
    }

    setCreating(true);

    try {
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
          opponentId: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          refundDone: false,

          // ✅ ADDED ONLY
          hostZangiContact: wallet?.zangiContact || ""
        }
      );

      setStake("");

    } catch (err) {
      alert(err.message);
    }

    setCreating(false);
  }

  // =========================
  // JOIN MATCH (ONLY ADDITION: opponentZangiContact)
  // =========================
  async function joinMatch(match) {
    if (loadingJoin) return;

    if (!canPlayMore()) {
      return alert("Max 7 running matches reached");
    }

    setLoadingJoin(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.status !== "waiting" || fresh.opponentId) {
        throw new Error("Already taken");
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        throw new Error("Insufficient balance");
      }

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

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: finalPot,

          // ✅ ADDED ONLY
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
      <h1>🎮 Lobby</h1>

      <p>
        Running Matches: {
          activeMatches.filter(m => m.status !== "finished").length
        } / 7
      </p>

      <h2>🔥 Your Matches</h2>

      {activeMatches.map(m => {
        const game = gameMap[m.gameId];

        let turnLabel = "";

        if (game && game.status !== "finished") {
          turnLabel =
            game.turn === user.$id
              ? "🟢 Your Turn"
              : "🔴 Opponent Turn";
        }

        const isHost = m.hostId === user.$id;

        const zangiId = isHost
          ? m.opponentZangiContact
          : m.hostZangiContact;

        const zangiUrl = buildZangiUrl(zangiId);

        return (
          <div key={m.$id} style={styles.card}>
            <div>
              <p>₦{m.stake}</p>
              <p>{m.status}</p>
              {turnLabel && <p>{turnLabel}</p>}
            </div>

            {m.status === "finished" ? (
              <button style={styles.finishedBtn} disabled>
                ✅ Finished
              </button>
            ) : m.gameId ? (
              <button
                style={styles.resumeBtn}
                onClick={() => goGame(m.gameId, m.stake)}
              >
                ▶ Resume
              </button>
            ) : null}

            {/* ✅ CHAT BUTTON ADDED */}
            {m.status !== "finished" && zangiUrl && (
              <button
                style={{
                  background: "#2563eb",
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  color: "#fff",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginTop: 8
                }}
                onClick={() => window.open(zangiUrl, "_blank")}
              >
                💬 Chat Opponent
              </button>
            )}
          </div>
        );
      })}

      <h2>🎯 Available</h2>

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button
            onClick={() => joinMatch(m)}
            disabled={loadingJoin === m.$id}
            style={styles.joinBtn}
          >
            {loadingJoin === m.$id ? "Joining..." : "Join"}
          </button>
        </div>
      ))}

      <input
        type="number"
        placeholder="Stake ₦"
        value={stake}
        onChange={e => setStake(e.target.value)}
      />

      <button onClick={createMatch} disabled={creating}>
        {creating ? "Creating..." : "Create Match"}
      </button>

      <button onClick={back}>Back</button>
    </div>
  );
}

// =========================
// STYLES (UNCHANGED)
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
    margin: "10px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 12
  },

  joinBtn: {
    background: "gold",
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    fontWeight: "bold",
    cursor: "pointer"
  },

  resumeBtn: {
    background: "#16a34a",
    padding: "10px 20px",
    borderRadius: 12,
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    minWidth: 110
  },

  finishedBtn: {
    background: "#16a34a",
    padding: "10px 18px",
    borderRadius: 10,
    color: "#fff",
    border: "none",
    fontWeight: "bold"
  }
};