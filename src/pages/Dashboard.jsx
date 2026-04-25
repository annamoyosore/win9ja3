import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  MATCH_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

export default function Dashboard({ goMatch, goWallet, logout }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [stakeInput, setStakeInput] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const u = await account.get();
      setUser(u);

      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", u.$id)]
      );

      if (res.documents.length) {
        setWallet(res.documents[0]);
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // MATCHMAKING (REAL)
  // =========================
  async function handleMatchmaking() {
    const stake = Number(stakeInput);

    if (!stake || stake <= 0) {
      alert("Enter a valid stake");
      return;
    }

    if (stake < 50) {
      alert("Minimum stake is ₦50");
      return;
    }

    if (stake > (wallet?.balance || 0)) {
      alert("Insufficient balance");
      return;
    }

    try {
      const user = await account.get();

      // 🔍 FIND EXISTING MATCH
      const res = await databases.listDocuments(
        DATABASE_ID,
        MATCH_COLLECTION,
        [
          Query.equal("stake", stake),
          Query.equal("status", "waiting"),
          Query.limit(1)
        ]
      );

      // ✅ JOIN MATCH
      if (res.documents.length > 0) {
        const match = res.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          match.$id,
          {
            player2: user.$id,
            status: "matched"
          }
        );

        goMatch(match.$id, stake);
        return;
      }

      // 🆕 CREATE MATCH
      const newMatch = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          player1: user.$id,
          player2: null,
          stake,
          status: "waiting",
          createdAt: new Date().toISOString()
        }
      );

      goMatch(newMatch.$id, stake);

    } catch (err) {
      console.error("Matchmaking error:", err);
      alert("Failed to start match");
    }
  }

  // =========================
  // UI
  // =========================
  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>🎮 Win9ja</h2>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.logo}>🎮 Win9ja</h1>

      <h2>Welcome, {user?.name || "Player"}</h2>

      <div style={styles.card}>
        💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}
      </div>

      {/* WALLET */}
      <button style={styles.btn} onClick={goWallet}>
        💳 Wallet
      </button>

      {/* STAKE INPUT */}
      <input
        type="number"
        placeholder="Enter stake (₦)"
        value={stakeInput}
        onChange={(e) => setStakeInput(e.target.value)}
        style={styles.input}
      />

      {/* PLAY WHOT */}
      <button style={styles.btn} onClick={handleMatchmaking}>
        🎲 Play WHOT
      </button>

      {/* LOGOUT */}
      <button
        style={{ ...styles.btn, background: "#ef4444" }}
        onClick={logout}
      >
        🚪 Logout
      </button>

      <div style={styles.games}>
        <h3>🚀 Coming Soon</h3>
        <p>Poker • Ludo • Blackjack</p>
      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    textAlign: "center",
    padding: 20,
    color: "white",
    background: "#0f172a",
    minHeight: "100vh"
  },
  logo: {
    color: "gold",
    marginBottom: 10
  },
  card: {
    background: "#111827",
    padding: 20,
    margin: "15px 0",
    borderRadius: 10,
    fontSize: 18
  },
  input: {
    width: "100%",
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    border: "none"
  },
  btn: {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "gold",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer"
  },
  games: {
    marginTop: 25,
    opacity: 0.7
  },
  loading: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a",
    color: "white"
  }
};