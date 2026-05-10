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
      console.error("Dashboard error:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>🎮 Win9ja</h2>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>

      {/* ================= HEADER ================= */}
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0 }}>🎮 Win9ja</h2>
          <small style={{ opacity: 0.7 }}>
            Welcome {user?.name || "Player"}
          </small>
        </div>

        <div style={styles.balanceBox}>
          ₦{Number(wallet?.balance || 0).toLocaleString()}
        </div>
      </div>

      {/* ================= CONTENT ================= */}
      <div style={styles.content}>

        {/* ================= GAMES ================= */}
        {activeTab === "games" && (
          <>
            <h3 style={styles.sectionTitle}>🔥 Popular Games</h3>

            <div style={styles.scrollRow}>

              <div style={styles.gameCard} onClick={goLobby}>
                <div style={styles.gameEmoji}>🃏</div>
                <div>WHOT GAME</div>
                <small style={styles.small}>Play Multiplayer</small>
              </div>

              <div style={styles.gameCard} onClick={goCasino}>
                <div style={styles.gameEmoji}>🎰</div>
                <div>CASINO</div>
                <small style={styles.small}>Jackpot Spin</small>
              </div>

              <div style={styles.gameCard} onClick={goSnakeLadder}>
                <div style={styles.gameEmoji}>🐍</div>
                <div>SNAKE & LADDER</div>
                <small style={styles.small}>Race To Win</small>
              </div>

            </div>
          </>
        )}

        {/* ================= WALLET ================= */}
        {activeTab === "wallet" && (
          <>
            <h3 style={styles.sectionTitle}>💰 Wallet</h3>

            <div style={styles.scrollRow}>

              <div style={styles.walletCard}>
                <div style={{ fontSize: 14, opacity: 0.7 }}>
                  AVAILABLE BALANCE
                </div>

                <h2>
                  ₦{Number(wallet?.balance || 0).toLocaleString()}
                </h2>
              </div>

              <div
                style={styles.walletCard}
                onClick={goTransactions}
              >
                📊 TRANSACTIONS
              </div>

              <div
                style={styles.walletCard}
                onClick={goWallet}
              >
                💼 FUND / WITHDRAW
              </div>

            </div>
          </>
        )}

        {/* ================= SUPPORT ================= */}
        {activeTab === "support" && (
          <div style={styles.page}>
            <h3>💬 Support</h3>

            <p>
              Need help with deposits, withdrawals or gameplay?
            </p>

            <p>
              Contact admin support directly inside the app.
            </p>
          </div>
        )}

        {/* ================= ABOUT ================= */}
        {activeTab === "about" && (
          <div style={styles.page}>
            <h3>ℹ️ About Win9ja</h3>

            <p>
              Win9ja is a multiplayer gaming platform where
              users can play games and win rewards instantly.
            </p>
          </div>
        )}

        {/* ================= INSTRUCTIONS ================= */}
        {activeTab === "instructions" && (
          <div style={styles.page}>
            <h3>📘 Instructions</h3>

            <p>1. Select a game</p>
            <p>2. Join a room</p>
            <p>3. Play and compete</p>
            <p>4. Winners receive payouts instantly</p>
          </div>
        )}

      </div>

      {/* ================= ADMIN ================= */}
      {user?.$id === ADMIN_ID && (
        <button
          style={styles.adminBtn}
          onClick={goAdmin}
        >
          🛠 Admin Panel
        </button>
      )}

      {/* ================= LOGOUT ================= */}
      <button
        style={styles.logoutBtn}
        onClick={logout}
      >
        🚪 Logout
      </button>

      {/* ================= BOTTOM NAV ================= */}
      <div style={styles.bottomNav}>

        <button
          style={
            activeTab === "games"
              ? styles.navActive
              : styles.navBtn
          }
          onClick={() => setActiveTab("games")}
        >
          🎮
          <span style={styles.navText}>Games</span>
        </button>

        <button
          style={
            activeTab === "wallet"
              ? styles.navActive
              : styles.navBtn
          }
          onClick={() => setActiveTab("wallet")}
        >
          💰
          <span style={styles.navText}>Wallet</span>
        </button>

        <button
          style={
            activeTab === "support"
              ? styles.navActive
              : styles.navBtn
          }
          onClick={() => setActiveTab("support")}
        >
          💬
          <span style={styles.navText}>Support</span>
        </button>

        <button
          style={
            activeTab === "about"
              ? styles.navActive
              : styles.navBtn
          }
          onClick={() => setActiveTab("about")}
        >
          ℹ️
          <span style={styles.navText}>More</span>
        </button>

      </div>

    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    paddingBottom: 100
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    background: "#111827",
    borderBottom: "1px solid #1f2937"
  },

  balanceBox: {
    background: "gold",
    color: "#000",
    padding: "8px 12px",
    borderRadius: 10,
    fontWeight: "bold",
    fontSize: 14
  },

  content: {
    padding: 15
  },

  sectionTitle: {
    marginBottom: 10
  },

  scrollRow: {
    display: "flex",
    overflowX: "auto",
    gap: 15,
    paddingBottom: 10
  },

  gameCard: {
    minWidth: 170,
    height: 150,
    background: "linear-gradient(145deg,#111827,#1f2937)",
    borderRadius: 18,
    padding: 15,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    cursor: "pointer",
    color: "gold",
    fontWeight: "bold",
    boxShadow: "0 0 12px rgba(0,0,0,0.4)"
  },

  gameEmoji: {
    fontSize: 40,
    marginBottom: 10
  },

  small: {
    marginTop: 5,
    opacity: 0.7,
    color: "#fff"
  },

  walletCard: {
    minWidth: 170,
    background: "#111827",
    borderRadius: 16,
    padding: 20,
    cursor: "pointer",
    boxShadow: "0 0 10px rgba(0,0,0,0.3)"
  },

  page: {
    background: "#111827",
    borderRadius: 16,
    padding: 20,
    lineHeight: 1.7
  },

  adminBtn: {
    width: "90%",
    margin: "15px auto 0",
    display: "block",
    padding: 14,
    border: "none",
    borderRadius: 12,
    background: "purple",
    color: "white",
    fontWeight: "bold"
  },

  logoutBtn: {
    width: "90%",
    margin: "10px auto 0",
    display: "block",
    padding: 14,
    border: "none",
    borderRadius: 12,
    background: "#dc2626",
    color: "white",
    fontWeight: "bold"
  },

  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: "#111827",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    padding: "10px 0",
    borderTop: "1px solid #1f2937"
  },

  navBtn: {
    background: "transparent",
    border: "none",
    color: "white",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 20
  },

  navActive: {
    background: "gold",
    border: "none",
    color: "black",
    borderRadius: 12,
    padding: "8px 14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 20,
    fontWeight: "bold"
  },

  navText: {
    fontSize: 11,
    marginTop: 2
  },

  loading: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center"
  }
};