// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query
} from "../lib/appwrite";

import { lockFunds, unlockFunds } from "../lib/wallet";

// =========================
// CONSTANTS
// =========================
const MATCH_COLLECTION = "matches";
const WALLET_COLLECTION = "wallets";
const GAME_COLLECTION = "games";
const ADMIN_ID = "69ef9fe863a02a7490b4"; // ✅ your admin userId

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
      winnerId: ""
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
  const [wallet, setWallet] = useState({ balance: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      const w = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );

      if (w.documents.length) {
        setWallet(w.documents[0]);
      }

      refresh(u.$id);
    } catch (err) {
      console.log("Init error:", err);
    }
  }

  // =========================
  // REALTIME
  // =========================
  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      async (res) => {
        const m = res.payload;

        refresh(user.$id);

        // AUTO ENTER GAME
        if (
          (m.hostId === user.$id || m.opponentId === user.$id) &&
          m.status === "matched" &&
          m.gameId
        ) {
          goGame(m.gameId, m.stake);
        }

        // AUTO MARK FINISHED
        if (m.gameId) {
          try {
            const g = await databases.getDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              m.gameId
            );

            if (g.status === "finished" && m.status !== "finished") {
              await databases.updateDocument(
                DATABASE_ID,
                MATCH_COLLECTION,
                m.$id,
                { status: "finished" }
              );
            }
          } catch {}
        }
      }
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await loadMatches();
    await loadActiveMatches(userId);
  }

  // =========================
  // LOAD MATCHES
  // =========================
  async function loadMatches() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [Query.equal("status", "waiting")]
      );

      setMatches(res.documents);
    } catch (e) {
      console.log("Load matches error", e);
    }
  }

  // =========================
  // ACTIVE MATCHES
  // =========================
  async function loadActiveMatches(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION
      );

      const mine = res.documents.filter(
        m =>
          (m.hostId === userId || m.opponentId === userId) &&
          m.status !== "finished"
      );

      setActiveMatches(mine);
    } catch (e) {
      console.log("Active match error", e);
    }
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loading || !user) return;

    // ❌ prevent joining own match
    if (match.hostId === user.$id) {
      alert("❌ You cannot join your own match");
      return;
    }

    setLoading(true);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        alert("Already taken");
        return;
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        alert("Insufficient balance");
        return;
      }

      // 🔒 lock opponent funds
      await lockFunds(user.$id, fresh.stake);

      // 💰 ADMIN CUT
      const total = fresh.stake * 2;
      const adminCut = Math.floor(total * 0.1);
      const finalPot = total - adminCut;

      // 💰 CREDIT ADMIN
      try {
        const adminWallet = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", ADMIN_ID)]
        );

        if (adminWallet.documents.length) {
          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            adminWallet.documents[0].$id,
            {
              balance:
                Number(adminWallet.documents[0].balance || 0) + adminCut
            }
          );
        }
      } catch (e) {
        console.log("Admin credit failed", e);
      }

      // UPDATE MATCH
      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: finalPot
        }
      );

      // CREATE GAME
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

      try {
        await unlockFunds(user.$id, match.stake);
      } catch {}
    }

    setLoading(false);
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

    setLoading(true);

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
          gameId: ""
        }
      );

      setStake("");

    } catch (err) {
      alert(err.message);
    }

    setLoading(false);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎮 Game Lobby</h1>

      {loading && <p>⚡ Processing...</p>}

      {/* ACTIVE MATCHES */}
      <h2 style={styles.section}>🔥 Your Matches</h2>

      {activeMatches.length === 0 && <p>No active matches</p>}

      {activeMatches.map(m => (
        <div key={m.$id} style={styles.card}>
          <div>
            <p>₦{m.stake}</p>
            <small>{m.status}</small>
          </div>

          <button onClick={() => goGame(m.gameId, m.stake)}>
            ▶ Resume
          </button>
        </div>
      ))}

      {/* AVAILABLE MATCHES */}
      <h2 style={styles.section}>🎯 Available</h2>

      {matches.length === 0 && <p>No matches available</p>}

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <span>₦{m.stake}</span>

          <button onClick={() => joinMatch(m)}>
            Join
          </button>
        </div>
      ))}

      {/* CREATE */}
      <input
        type="number"
        placeholder="Stake ₦"
        value={stake}
        onChange={e => setStake(e.target.value)}
      />

      <button onClick={createMatch}>
        Create Match
      </button>

      <button onClick={back}>← Back</button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    minHeight: "100vh",
    background: "#020617",
    color: "#fff"
  },
  title: { fontSize: 24 },
  section: { marginTop: 20 },
  card: {
    background: "#111",
    padding: 10,
    margin: "10px 0",
    display: "flex",
    justifyContent: "space-between"
  }
};