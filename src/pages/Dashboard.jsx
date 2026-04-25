// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  Query
} from "../lib/appwrite";

// =========================
// COMPONENT
// =========================
export default function Dashboard({ goLobby, goWallet, logout }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // LOAD USER + WALLET
  // =========================
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
  // LOADING STATE
  // =========================
  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>🎮 Win9ja</h2>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1 style={styles.logo}>🎮 Win9ja</h1>

      <h2>Welcome, {user?.name || "Player"}</h2>

      {/* WALLET BALANCE */}
      <div style={styles.card}>
        💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}
      </div>

      {/* WALLET BUTTON */}
      <button
        style={styles.btn}
        onClick={() => {
          console.log("Go Wallet clicked");
          goWallet && goWallet();
        }}
      >
        💳 Wallet
      </button>

      {/* PLAY WHOT BUTTON */}
      <button
        style={styles.btn}
        onClick={() => {
          console.log("Go Lobby clicked");
          goLobby && goLobby();
        }}
      >
        🎲 Play WHOT
      </button>

      {/* LOGOUT */}
      <button
        style={{ ...styles.btn, background: "#ef4444" }}
        onClick={logout}
      >
        🚪 Logout
      </button>

      {/* FUTURE GAMES */}
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