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
const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// AVATAR GENERATOR
// =========================
function getAvatar(name = "User") {
  const letter = name.charAt(0).toUpperCase();
  return `https://ui-avatars.com/api/?name=${letter}&background=random&color=fff`;
}

// =========================
// GET USER NAME
// =========================
async function getUserName(userId) {
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
    );

    if (res.documents.length) {
      return res.documents[0].name || null;
    }
  } catch {}

  return null;
}

// =========================
// CREATE DECK
// =========================
function createDeck() {
  const shapes = ["c", "t", "s", "r", "x"];
  let deck = [];

  for (let s of shapes) {
    for (let i = 1; i <= 13; i++) {
      deck.push(s + i);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// CREATE GAME
// =========================
async function createGame(match, opponentId) {
  const deck = createDeck();

  const hand1 = deck.splice(0, 6);
  const hand2 = deck.splice(0, 6);
  const top = deck.pop();

  return await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: `${match.hostId},${opponentId}`,
      hands: `${hand1.join(",")}|${hand2.join(",")}`,
      deck: deck.join(","),
      discard: top,
      turn: opponentId,
      status: "running",
      round: "1",
      winnerId: "",
      turnStartTime: new Date().toISOString()
    }
  );
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

  async function refresh(userId) {
    await loadMatches(userId);
    await loadActiveMatches(userId);
  }

  // =========================
  // LOAD MATCHES
  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("status", "waiting"),
        Query.isNull("opponentId")
      ]
    );

    const filtered = res.documents.filter(
      (m) => m.hostId !== userId
    );

    const withNames = await Promise.all(
      filtered.map(async (m) => {
        const hostName = await getUserName(m.hostId);

        return {
          ...m,
          hostName: hostName || "Player"
        };
      })
    );

    setMatches(withNames);
  }

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

    const withNames = await Promise.all(
      mine.map(async (m) => {
        const hostName = await getUserName(m.hostId);
        const opponentName = m.opponentId
          ? await getUserName(m.opponentId)
          : null;

        return {
          ...m,
          hostName: hostName || "Player",
          opponentName: opponentName || null
        };
      })
    );

    setActiveMatches(withNames);
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loadingMatchId) return;

    if (match.hostId === user.$id) {
      return alert("You cannot join your own match");
    }

    setLoadingMatchId(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.status !== "waiting" || fresh.opponentId) {
        throw new Error("Match already taken");
      }

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
          pot: total - adminCut,
          adminFee: adminCut,
          adminPaid: true
        }
      );

      const game = await createGame(updated, user.$id);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        updated.$id,
        { gameId: game.$id }
      );

      goGame(game.$id, updated.stake);

    } catch (err) {
      alert(err.message);
    }

    setLoadingMatchId(null);
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount < 50) {
      return alert("Minimum ₦50");
    }

    if ((wallet?.balance || 0) < amount) {
      return alert("Insufficient balance");
    }

    try {
      await lockFunds(user.$id, amount);

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
          gameId: "",
          adminPaid: false,
          refunded: false,
          createdAt: new Date().toISOString()
        }
      );

      setStake("");

    } catch (err) {
      alert(err.message);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎮 Game Lobby</h1>

      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.map((m) => {
        const isHost = m.hostId === user.$id;
        const display = isHost
          ? `You vs ${m.opponentName || "Waiting..."}`
          : `${m.hostName} vs You`;

        return (
          <div key={m.$id} style={styles.card}>
            <div style={styles.playerRow}>
              <img src={getAvatar(m.hostName)} style={styles.avatar} />
              <span>{display}</span>
            </div>

            <div>
              <p>₦{m.stake}</p>
              <p>{m.status}</p>
            </div>

            <button
              style={styles.resumeBtn}
              onClick={() => goGame(m.gameId, m.stake)}
            >
              ▶ Resume
            </button>
          </div>
        );
      })}

      <h2 style={styles.section}>🎯 Available</h2>

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <div style={styles.playerRow}>
            <img src={getAvatar(m.hostName)} style={styles.avatar} />
            <span>{m.hostName}</span>
          </div>

          <span>₦{m.stake}</span>

          <button
            onClick={() => joinMatch(m)}
            style={styles.joinBtn}
            disabled={loadingMatchId === m.$id}
          >
            {loadingMatchId === m.$id ? "Joining..." : "Join"}
          </button>
        </div>
      ))}

      <div style={styles.createBox}>
        <input
          type="number"
          placeholder="Stake ₦"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          style={styles.input}
        />

        <button onClick={createMatch} style={styles.createBtn}>
          Create Match
        </button>
      </div>

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
  title: { fontSize: 28, fontWeight: "bold" },
  section: { marginTop: 20, color: "gold" },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: "50%"
  },
  joinBtn: { background: "gold", padding: 8 },
  resumeBtn: { background: "green", padding: 8, color: "#fff" },
  input: { width: "100%", padding: 10 },
  createBtn: { width: "100%", padding: 10, background: "blue", color: "#fff" },
  back: { marginTop: 20, padding: 10 }
};