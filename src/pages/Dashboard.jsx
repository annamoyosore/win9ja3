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
export default function Dashboard({
  goLobby,
  goWallet,
  goDice,
  goTransactions,   // ✅ NEW
  logout
}) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
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

      <h2 style={styles.welcome}>
        Welcome, {user?.name || "Player"}
      </h2>

      {/* WALLET */}
      <div style={styles.card}>
        💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}
      </div>

      <button style={styles.btn} onClick={() => goWallet?.()}>
        💳 Wallet
      </button>

      {/* 🆕 TRANSACTIONS */}
      <button
        style={styles.txBtn}
        onClick={() => goTransactions?.()}
      >
        📊 Transactions
      </button>

      {/* GAMES */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>🎮 Games</h3>

        <button style={styles.btn} onClick={() => goLobby?.()}>
          🎲 Play WHOT
        </button>

        <button style={styles.diceBtn} onClick={() => goDice?.()}>
          🎲 Play Dice
        </button>
      </div>

      {/* LOGOUT */}
      <button
        style={{ ...styles.btn, background: "#ef4444" }}
        onClick={logout}
      >
        🚪 Logout
      </button>

      {/* COMING SOON */}
      <div style={styles.games}>
        <h3>🚀 Coming Soon</h3>
        <p>Poker • Blackjack</p>
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
    background: "linear-gradient(135deg,#020617,#0f172a)",
    minHeight: "100vh"
  },
  logo: {
    color: "gold",
    marginBottom: 10,
    fontSize: 28
  },
  welcome: {
    marginBottom: 10
  },
  card: {
    background: "#111827",
    padding: 20,
    margin: "15px 0",
    borderRadius: 12,
    fontSize: 18,
    boxShadow: "0 4px 10px rgba(0,0,0,0.4)"
  },
  section: {
    marginTop: 20
  },
  sectionTitle: {
    color: "#facc15",
    marginBottom: 10
  },
  btn: {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "gold",
    border: "none",
    borderRadius: 10,
    fontWeight: "bold",
    cursor: "pointer"
  },
  txBtn: {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "#38bdf8",
    border: "none",
    borderRadius: 10,
    fontWeight: "bold",
    cursor: "pointer",
    color: "#000"
  },
  diceBtn: {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "#22c55e",
    border: "none",
    borderRadius: 10,
    fontWeight: "bold",
    cursor: "pointer",
    color: "#fff"
  },
  games: {
    marginTop: 30,
    opacity: 0.6
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