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

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // INIT (SAFE)
  // =========================
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      try {
        const w = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", u.$id)]
        );

        if (w.documents.length) {
          setWallet(w.documents[0]);
        }
      } catch (err) {
        console.warn("Wallet load failed:", err.message);
      }

      await refreshAll(u.$id);

    } catch (err) {
      console.error("AUTH ERROR:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // REALTIME (SAFE)
  // =========================
  useEffect(() => {
    if (!user) return;

    let unsub;

    try {
      unsub = databases.client.subscribe(
        `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
        () => refreshAll(user.$id)
      );
    } catch (err) {
      console.warn("Realtime failed:", err.message);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  async function refreshAll(userId) {
    await Promise.all([
      loadMatches(),
      loadActiveMatches(userId)
    ]);
  }

  // =========================
  // LOAD MATCHES
  // =========================
  async function loadMatches() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [
          Query.equal("status", "waiting"),
          Query.orderDesc("$createdAt")
        ]
      );

      setMatches(res.documents);

    } catch (err) {
      console.warn("Load matches failed:", err.message);
    }
  }

  // =========================
  // ACTIVE MATCHES
  // =========================
  async function loadActiveMatches(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [Query.notEqual("status", "finished")]
      );

      const myMatches = res.documents
        .filter(
          (m) =>
            m.hostId === userId ||
            m.opponentId === userId
        )
        .sort(
          (a, b) =>
            new Date(b.$updatedAt) - new Date(a.$updatedAt)
        );

      setActiveMatches(myMatches);

    } catch (err) {
      console.warn("Active matches failed:", err.message);
    }
  }

  // =========================
  // JOIN MATCH (SAFE)
  // =========================
  async function joinMatch(match) {
    if (loading) return;

    try {
      setLoading(true);

      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        alert("Match already taken");
        return;
      }

      if ((wallet?.balance || 0) < fresh.stake) {
        alert("Insufficient balance");
        return;
      }

      await lockFunds(user.$id, fresh.stake);

      const updated = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: fresh.stake * 2
        }
      );

      let gameId = updated.gameId;

      if (!gameId) {
        const game = await databases.createDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          ID.unique(),
          {
            matchId: updated.$id,
            players: [updated.hostId, updated.opponentId],
            turn: user.$id,
            status: "running",
            round: 1,
            turnStartTime: new Date().toISOString()
          }
        );

        gameId = game.$id;

        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          updated.$id,
          { gameId }
        );
      }

      goGame(gameId, updated.stake);

    } catch (err) {
      alert(err.message);

      try {
        await unlockFunds(user.$id, match.stake);
      } catch {}

    } finally {
      setLoading(false);
    }
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
      setLoading(true);

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
          createdAt: new Date().toISOString()
        }
      );

      alert("Match created");

    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // UI SAFE GUARD
  // =========================
  if (loading) {
    return <div style={{ padding: 20 }}>Loading Lobby...</div>;
  }

  return (
    <div style={{ padding: 20, color: "#fff" }}>
      <h2>🎮 Lobby</h2>

      <h3>Available Matches</h3>

      {matches.length === 0 && <p>No matches</p>}

      {matches.map((m) => (
        <div key={m.$id}>
          ₦{m.stake}
          <button onClick={() => joinMatch(m)}>Join</button>
        </div>
      ))}

      <h3>Create Match</h3>

      <input
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Amount"
      />

      <button onClick={createMatch}>Create</button>

      <br /><br />
      <button onClick={back}>Back</button>
    </div>
  );
}