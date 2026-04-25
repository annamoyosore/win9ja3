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

import { lockFunds } from "../lib/wallet";

// =========================
// COMPONENT
// =========================
export default function Lobby({ goMatch, back }) {
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      await loadWallet(u.$id);
      await loadMatches();
    } catch (err) {
      console.error("INIT ERROR:", err);
    }
  }

  // =========================
  // LOAD WALLET
  // =========================
  async function loadWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
    );

    if (res.documents.length) {
      setWallet(res.documents[0]);
    }
  }

  // =========================
  // LOAD MATCHES
  // =========================
  async function loadMatches() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("status", "waiting"),
        Query.orderDesc("$createdAt")
      ]
    );

    setMatches(res.documents);
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loading) return;
    setLoading(true);

    try {
      if (!user) return;

      if (match.hostId === user.$id) {
        alert("You cannot join your own match");
        return;
      }

      if (match.opponentId) {
        alert("Match already full");
        return;
      }

      if ((wallet?.balance || 0) < match.stake) {
        alert("Insufficient balance");
        return;
      }

      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        alert("Someone already joined");
        return;
      }

      // 🔒 LOCK AFTER VALIDATION
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

      await loadWallet(user.$id); // ✅ refresh balance
      goMatch(fresh.$id, fresh.stake);

    } catch (err) {
      console.error("JOIN ERROR:", err);
      alert(err.message || "Join failed");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    if (loading) return;
    setLoading(true);

    const amount = Number(stake);

    try {
      if (!amount || amount <= 0) {
        alert("Enter valid stake");
        return;
      }

      if (amount < 50) {
        alert("Minimum stake is ₦50");
        return;
      }

      if ((wallet?.balance || 0) < amount) {
        alert("Insufficient balance");
        return;
      }

      // ✅ CREATE FIRST (IMPORTANT)
      const match = await databases.createDocument(
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

      // 🔒 THEN LOCK (SAFE)
      await lockFunds(user.$id, amount);

      await loadWallet(user.$id); // refresh wallet
      await loadMatches();        // refresh lobby

      goMatch(match.$id, amount);

    } catch (err) {
      console.error("CREATE ERROR:", err);
      alert(err.message || "Create failed");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🎮 Active Matches</h2>

      {matches.length === 0 && <p>No active matches</p>}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>💰 ₦{Number(m.stake).toLocaleString()}</p>

          <button
            style={styles.btn}
            onClick={() => joinMatch(m)}
            disabled={loading}
          >
            Join
          </button>
        </div>
      ))}

      <h3>Create Match</h3>

      <input
        type="number"
        placeholder="Enter stake ₦"
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        style={styles.input}
      />

      <button
        onClick={createMatch}
        style={styles.btn}
        disabled={loading}
      >
        {loading ? "Processing..." : "Create Match"}
      </button>

      <button onClick={back} style={styles.back}>
        ← Back
      </button>
    </div>
  );
}