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
function getAvatar(name = "U") {
  return name.charAt(0).toUpperCase();
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
      payoutDone: false
    }
  );
}

// =========================
// COMPONENT
// =========================
export default function Lobby({ goGame, back }) {
  const [available, setAvailable] = useState([]);
  const [myMatches, setMyMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
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

    await refresh(u.$id);
    setLoading(false);
  }

  // =========================
  // LOAD NAMES (SAFE)
  // =========================
  async function loadNames(userIds) {
    let map = {};

    await Promise.all(
      userIds.map(async (id) => {
        try {
          const res = await databases.listDocuments(
            DATABASE_ID,
            WALLET_COLLECTION,
            [Query.equal("userId", id)]
          );

          map[id] =
            res.documents[0]?.name ||
            "Player-" + id.slice(0, 4);
        } catch {
          map[id] = "Player";
        }
      })
    );

    setNames((prev) => ({ ...prev, ...map }));
  }

  // =========================
  // REFRESH
  // =========================
  async function refresh(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION
    );

    const all = res.documents;

    const availableMatches = all.filter(
      (m) =>
        m.status === "waiting" &&
        !m.opponentId &&
        m.hostId !== userId
    );

    const mine = all.filter(
      (m) =>
        m.hostId === userId ||
        m.opponentId === userId
    );

    setAvailable(availableMatches);
    setMyMatches(mine);

    const ids = new Set();
    all.forEach((m) => {
      ids.add(m.hostId);
      if (m.opponentId) ids.add(m.opponentId);
    });

    loadNames(Array.from(ids));
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

      if (fresh.status !== "waiting") {
        throw new Error("Match taken");
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        throw new Error("Insufficient balance");
      }

      await lockFunds(user.$id, fresh.stake);

      const total = fresh.stake * 2;
      const adminCut = Math.floor(total * 0.1);
      const pot = total - adminCut;

      // ✅ CREDIT ADMIN
      const adminWalletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID)]
      );

      if (adminWalletRes.documents.length) {
        const adminWallet = adminWalletRes.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.$id,
          {
            balance:
              Number(adminWallet.balance || 0) + adminCut
          }
        );
      }

      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot,
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
          createdAt: new Date().toISOString()
        }
      );

      setStake("");
      refresh(user.$id);

    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div>Loading lobby...</div>;

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      {/* CREATE */}
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

      {/* AVAILABLE */}
      <h3>🟢 Available</h3>
      {available.map((m) => (
        <div key={m.$id} style={styles.card}>
          <div>
            <b>{getAvatar(names[m.hostId])}</b>{" "}
            {names[m.hostId]}
            <p>₦{m.stake}</p>
          </div>

          <button
            onClick={() => joinMatch(m)}
            disabled={loadingMatchId === m.$id}
          >
            Join
          </button>
        </div>
      ))}

      {/* MY MATCHES */}
      <h3>🎯 My Matches</h3>
      {myMatches.map((m) => {
        const host = names[m.hostId];
        const opp = names[m.opponentId];

        return (
          <div key={m.$id} style={styles.card}>
            <div>
              <b>{getAvatar(host)}</b> {host}
              {" vs "}
              <b>{getAvatar(opp)}</b> {opp || "Waiting..."}
              <p>₦{m.stake}</p>
            </div>

            {m.status === "finished" ? (
              <span>✅ Finished</span>
            ) : m.status === "waiting" ? (
              <span>⏳ Waiting</span>
            ) : (
              <button onClick={() => goGame(m.gameId, m.stake)}>
                ▶ Play
              </button>
            )}
          </div>
        );
      })}

      <button onClick={back}>⬅ Back</button>
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
    margin: "10px 0",
    borderRadius: 8,
    display: "flex",
    justifyContent: "space-between"
  },
  createBox: { marginBottom: 20 },
  input: { width: "100%", padding: 10 },
  createBtn: {
    width: "100%",
    padding: 10,
    background: "gold"
  }
};