import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  Query
} from "../lib/appwrite";

// 🔒 ADMIN ID
const ADMIN_ID = "69ef9fe863a02a7490b4";

export default function Dashboard({
  goLobby,
  goCasino,
  goWallet,
  goTransactions,
  goSnakeLadder,
  goAdmin,
  logout
}) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [activeTab, setActiveTab] = useState("games");
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        Loading...
      </div>
    );
  }

  return (
    <div style={styles.container}>

      {/* ================= TOP VERTICAL MENU ================= */}
      <div style={styles.sideMenu}>

        <button
          style={activeTab === "games" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("games")}
        >
          🎮 Games
        </button>

        <button
          style={activeTab === "wallet" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("wallet")}
        >
          💰 Wallet
        </button>

        <button
          style={activeTab === "support" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("support")}
        >
          💬 Support
        </button>

        <button
          style={activeTab === "about" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("about")}
        >
          ℹ️ About
        </button>

        <button
          style={activeTab === "instructions" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("instructions")}
        >
          📘 Instructions
        </button>

      </div>

      <h2>Welcome {user?.name || "Player"}</h2>

      {/* ================= GAMES ================= */}
      {activeTab === "games" && (
        <div style={styles.scrollRow}>
          <div style={styles.card} onClick={goLobby}>🎲 WHOT GAME</div>
          <div style={styles.card} onClick={goCasino}>🎰 CASINO JACKPOT</div>
          <div style={styles.card} onClick={goSnakeLadder}>🐍 SNAKE & LADDER</div>
        </div>
      )}

      {/* ================= WALLET ================= */}
      {activeTab === "wallet" && (
        <div style={styles.scrollRow}>
          <div style={styles.card}>
            💳 BALANCE
            <h3>₦{Number(wallet?.balance || 0).toLocaleString()}</h3>
          </div>

          <div style={styles.card} onClick={goTransactions}>
            📊 TRANSACTIONS
          </div>

          <div style={styles.card} onClick={goWallet}>
            💼 FUND / WITHDRAW
          </div>
        </div>
      )}

      {/* ================= SUPPORT ================= */}
      {activeTab === "support" && (
        <div style={styles.page}>
          💬 Need help? Contact support via WhatsApp or admin panel.
        </div>
      )}

      {/* ================= ABOUT ================= */}
      {activeTab === "about" && (
        <div style={styles.page}>
          🎮 Win9ja Gaming Platform<br />
          Play games, win rewards, withdraw instantly.
        </div>
      )}

      {/* ================= INSTRUCTIONS ================= */}
      {activeTab === "instructions" && (
        <div style={styles.page}>
          📘 How to Play:<br />
          - Select a game<br />
          - Place bet<br />
          - Play and win rewards
        </div>
      )}

      {/* ================= ADMIN ================= */}
      {user?.$id === ADMIN_ID && (
        <button style={styles.admin} onClick={goAdmin}>
          🛠 Admin Panel
        </button>
      )}

      <button style={styles.logout} onClick={logout}>
        🚪 Logout
      </button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    minHeight: "100vh",
    background: "#0f172a",
    color: "white",
    padding: 15
  },

  sideMenu: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 15
  },

  tab: {
    padding: 10,
    background: "#1f2937",
    border: "none",
    borderRadius: 8,
    color: "white",
    textAlign: "left"
  },

  activeTab: {
    padding: 10,
    background: "gold",
    border: "none",
    borderRadius: 8,
    color: "black",
    fontWeight: "bold",
    textAlign: "left"
  },

  scrollRow: {
    display: "flex",
    overflowX: "auto",
    gap: 15,
    padding: "10px 0"
  },

  card: {
    minWidth: 170,
    background: "#111827",
    padding: 20,
    borderRadius: 12,
    textAlign: "center",
    cursor: "pointer"
  },

  page: {
    background: "#111827",
    padding: 20,
    borderRadius: 12,
    marginTop: 10
  },

  admin: {
    width: "100%",
    marginTop: 20,
    padding: 12,
    background: "purple",
    border: "none",
    borderRadius: 10,
    color: "white"
  },

  logout: {
    width: "100%",
    marginTop: 10,
    padding: 12,
    background: "red",
    border: "none",
    borderRadius: 10,
    color: "white"
  },

  loading: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "white"
  }
};