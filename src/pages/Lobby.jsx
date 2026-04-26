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
// CREATE DECK
// =========================
function createDeck() {
  const shapes = ["circle", "triangle", "square", "star", "cross"];
  const deck = [];

  for (const shape of shapes) {
    for (let i = 1; i <= 13; i++) {
      if (i === 6 || i === 9) continue;
      deck.push({ shape, number: i });
    }
    deck.push({ shape, number: 14 });
  }

  return deck.sort(() => Math.random() - 0.5);
}

// =========================
// CREATE GAME
// =========================
async function createGame(match) {
  const deck = createDeck();

  return databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    match.$id,
    {
      players: [match.hostId, match.opponentId],
      hands: JSON.stringify([deck.splice(0, 6), deck.splice(0, 6)]),
      deck: JSON.stringify(deck),
      discard: JSON.stringify([deck.pop()]),
      scores: JSON.stringify({ p1: 0, p2: 0 }),
      round: 1,
      turn: match.hostId,
      status: "running",
      winnerId: "",
      turnStartTime: new Date().toISOString()
    }
  );
}

// =========================
// WAIT FOR GAME
// =========================
async function waitForGame(matchId) {
  let ready = false;

  while (!ready) {
    try {
      await databases.getDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        matchId
      );
      ready = true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

// =========================
// COMPONENT
// =========================
export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);

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

    loadMatches();
  }

  async function loadMatches() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.equal("status", "waiting")]
    );

    setMatches(res.documents);
  }

  // =========================
  // JOIN MATCH → GAME
  // =========================
  async function joinMatch(match) {
    try {
      setLoading(true);

      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      await lockFunds(user.$id, fresh.stake);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: fresh.stake * 2
        }
      );

      // create game (or skip if exists)
      try {
        await createGame({
          ...fresh,
          opponentId: user.$id
        });
      } catch {}

      await waitForGame(fresh.$id);

      goGame(fresh.$id, fresh.stake);

    } catch (err) {
      alert(err.message);
      await unlockFunds(user.$id, match.stake);
      setLoading(false);
    }
  }

  // =========================
  // CREATE MATCH → GAME
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (amount < 50) return alert("Min ₦50");
    if ((wallet?.balance || 0) < amount)
      return alert("Insufficient balance");

    try {
      setLoading(true);

      await lockFunds(user.$id, amount);

      const match = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: "",
          stake: amount,
          pot: amount,
          status: "waiting",
          createdAt: new Date().toISOString()
        }
      );

      // 🔥 wait for opponent automatically (optional skip)

      goGame(match.$id, amount);

    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2>🎮 Lobby</h2>

      {loading && <p>⚡ Matching...</p>}

      {matches.map((m) => (
        <div key={m.$id}>
          ₦{m.stake}
          <button onClick={() => joinMatch(m)}>Join</button>
        </div>
      ))}

      <input
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake"
      />

      <button onClick={createMatch}>Create Match</button>

      <button onClick={back}>Back</button>
    </div>
  );
}