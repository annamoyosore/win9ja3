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

// =========================
// COMPONENT
// =========================
export default function Lobby({ goMatch, back }) {
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  // =========================
  // INIT LOAD
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
      console.error("Init error:", err);
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
  // LOCK FUNDS
  // =========================
  async function lockFunds(amount) {
    if (!wallet) throw new Error("Wallet not loaded");

    if (wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: wallet.balance - amount,
        locked: (wallet.locked || 0) + amount
      }
    );

    // refresh wallet
    await loadWallet(user.$id);
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    try {
      if (!user || !wallet) return;

      if (match.player1 === user.$id) {
        alert("You cannot join your own match");
        return;
      }

      if (match.player2) {
        alert("Match already full");
        return;
      }

      if (wallet.balance < match.stake) {
        alert("Insufficient balance");
        return;
      }

      // 🔒 lock funds FIRST
      await lockFunds(match.stake);

      // 🔄 re-fetch to avoid race
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.player2) {
        alert("Someone just joined");
        return;
      }

      // ✅ update match
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id,
        {
          player2: user.$id,
          status: "matched",
          pot: match.stake * 2
        }
      );

      goMatch(match.$id, match.stake);

    } catch (err) {
      console.error(err);
      alert(err.message || "Join failed");
    }
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    try {
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

      // 🔒 LOCK FUNDS FIRST
      await lockFunds(amount);

      // ✅ CREATE MATCH
      const match = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          player1: user.$id,
          player2: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          winner: null,
          createdAt: new Date().toISOString()
        }
      );

      goMatch(match.$id, amount);

    } catch (err) {
      console.error(err);
      alert(err.message || "Create failed");
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h2>🎮 Active Matches</h2>

      {/* MATCH LIST */}
      {matches.length === 0 && <p>No active matches</p>}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>💰 ₦{Number(m.stake).toLocaleString()}</p>

          <button
            style={styles.btn}
            onClick={() => joinMatch(m)}
          >
            Join
          </button>
        </div>
      ))}

      {/* CREATE */}
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
    marginTop: 5,
    cursor: "pointer"
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    borderRadius: 6,
    border: "none"
  },
  back: {
    marginTop: 20,
    background: "gray",
    padding: 10,
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  }
};