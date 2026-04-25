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

export default function Lobby({ goMatch, back }) {
  const [matches, setMatches] = useState([]);
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const u = await account.get();
      setUser(u);

      // wallet
      const w = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );

      if (w.documents.length) {
        setWallet(w.documents[0]);
      }

      await checkActiveMatch(u.$id);
      await loadMatches();

    } catch (err) {
      console.error("INIT ERROR:", err);
    }
  }

  // ✅ FIXED ACTIVE MATCH CHECK
  async function checkActiveMatch(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [
          Query.limit(20),
          Query.orderDesc("$createdAt")
        ]
      );

      // ✅ FILTER MANUALLY (VERY IMPORTANT)
      const active = res.documents.find(
        (m) =>
          (m.hostId === userId || m.opponentId === userId) &&
          m.status !== "finished"
      );

      if (active) {
        setActiveMatch(active);
      }

    } catch (err) {
      console.error("ACTIVE MATCH ERROR:", err);
    }
  }

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
      console.error("LOAD MATCHES ERROR:", err);
    }
  }

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

      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) {
        alert("Someone already joined");
        return;
      }

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

      goMatch(fresh.$id, fresh.stake);

    } catch (err) {
      console.error(err);

      try {
        await unlockFunds(user.$id, Number(match?.stake || 0));
      } catch {}
    }
  }

  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount <= 0) return alert("Enter valid stake");
    if (amount < 50) return alert("Minimum stake is ₦50");
    if ((wallet?.balance || 0) < amount)
      return alert("Insufficient balance");

    let match = null;

    try {
      match = await databases.createDocument(
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

      await lockFunds(user.$id, amount);

      goMatch(match.$id, amount);

    } catch (err) {
      console.error(err);

      if (match?.$id) {
        await databases.deleteDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          match.$id
        );
      }
    }
  }

  return (
    <div style={styles.container}>
      <h2>🎮 Lobby</h2>

      {/* ✅ SHOW RESUME BUTTON */}
      {activeMatch && (
        <div style={styles.activeBox}>
          <p>⚡ Ongoing Match Found</p>
          <button
            style={styles.btn}
            onClick={() =>
              goMatch(activeMatch.$id, activeMatch.stake)
            }
          >
            ▶ Resume Game
          </button>
        </div>
      )}

      <h3>Available Matches</h3>

      {matches.length === 0 && <p>No active matches</p>}

      {matches.map((m) => (
        <div key={m.$id} style={styles.card}>
          <p>💰 ₦{Number(m.stake).toLocaleString()}</p>
          <button onClick={() => joinMatch(m)} style={styles.btn}>
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

const styles = {
  container: {
    padding: 20,
    background: "#0f172a",
    color: "white",
    minHeight: "100vh"
  },
  activeBox: {
    background: "#1e293b",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20
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
    cursor: "pointer"
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    borderRadius: 6
  },
  back: {
    marginTop: 20,
    padding: 10,
    background: "gray",
    border: "none",
    borderRadius: 6
  }
};