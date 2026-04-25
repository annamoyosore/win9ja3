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

import { lockFunds } from "../lib/wallet"; // ✅ LOCK SYSTEM

// =========================
// COMPONENT
// =========================
export default function Lobby({ goMatch, back }) {
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

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

      const w = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );

      if (w.documents.length) setWallet(w.documents[0]);

      loadMatches();
    } catch (err) {
      console.error(err);
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
  // JOIN MATCH (LOCK + SAFE)
// =========================
  async function joinMatch(match) {
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

      // 🔄 REFRESH MATCH
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        alert("Someone already joined");
        return;
      }

      // 🔒 LOCK MONEY FIRST
      await lockFunds(user.$id, fresh.stake);

      // ✅ UPDATE MATCH
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

      goMatch(fresh.$id, fresh.stake);

    } catch (err) {
      console.error(err);
      alert("Join failed");
    }
  }

  // =========================
  // CREATE MATCH (LOCK)
// =========================
  async function createMatch() {
    const amount = Number(stake);

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

    try {
      // 🔒 LOCK HOST FUNDS
      await lockFunds(user.$id, amount);

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

      goMatch(match.$id, amount);

    } catch (err) {
      console.error(err);
      alert("Create failed");
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

          <button style={styles.btn} onClick={() => joinMatch(m)}>
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

      <button onClick={createMatch} style={styles.btn}>
        Create Match
      </button>

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
    color: "white",
    background: "#0f172a",
    minHeight: "100vh"
  },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10
  },
  btn: {
    padding: 10,
    background: "gold",
    border: "none",
    borderRadius: 6,
    marginTop: 5
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    borderRadius: 6
  },
  back: {
    marginTop: 20,
    background: "gray",
    padding: 10,
    border: "none",
    borderRadius: 6
  }
};