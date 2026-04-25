import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

export default function Lobby({ goMatch, back }) {
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMatches();
  }, []);

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
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    try {
      const user = await account.get();

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id,
        {
          player2: user.$id,
          status: "matched"
        }
      );

      goMatch(match.$id, match.stake);
    } catch (err) {
      console.error(err);
      alert("Failed to join match");
    }
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount <= 0) {
      alert("Enter valid stake");
      return;
    }

    try {
      const user = await account.get();

      const match = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          player1: user.$id,
          player2: null,
          stake: amount,
          status: "waiting",
          createdAt: new Date().toISOString()
        }
      );

      goMatch(match.$id, amount);
    } catch (err) {
      console.error(err);
      alert("Failed to create match");
    }
  }

  // =========================
  // UI
  // =========================
  if (loading) return <p>Loading lobby...</p>;

  return (
    <div style={styles.container}>
      <h2>🎮 Active Matches</h2>

      {/* MATCH LIST */}
      {matches.length === 0 && <p>No active matches</p>}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>💰 ₦{m.stake.toLocaleString()}</p>

          <button onClick={() => joinMatch(m)} style={styles.btn}>
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