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
  goAdmin,
  goSnakeLobby,
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function openWhatsApp() {
    const url = `https://wa.me/18622726355?text=Hello%20Support,%20I%20need%20help%20with%20my%20account`;
    window.open(url, "_blank");
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

      {/* HEADER */}
      <div style={styles.header}>
        <h2 style={styles.title}>🎮 Win9ja Dashboard</h2>
        <p style={styles.balance}>
          Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}
        </p>
      </div>

      {/* GAMES */}
      <h3 style={styles.sectionTitle}>🎮 Games</h3>

      <div style={styles.gameGrid}>

        {/* WHOT */}
        <div style={{ ...styles.gameCard, background: "#2563eb" }} onClick={goLobby}>
          <div style={styles.logo}>🎴 WHOT</div>
          <p>Card battle game</p>
        </div>

        {/* SNAKE */}
        <div style={{ ...styles.gameCard, background: "#16a34a" }} onClick={goSnakeLobby}>
          <div style={styles.logo}>🐍 Snake & Ladder</div>
          <p>Race to 100 tiles</p>
        </div>

        {/* CASINO */}
        <div style={{ ...styles.gameCard, background: "#f59e0b" }} onClick={goCasino}>
          <div style={styles.logo}>🎰 Jackpot</div>
          <p>Spin & win rewards</p>
        </div>

      </div>

      {/* MENU */}
      <h3 style={styles.sectionTitle}>⚙️ Menu</h3>

      <div style={styles.menu}>

        <div style={styles.menuBtn} onClick={goWallet}>
          💰 Wallet
        </div>

        <div style={styles.menuBtn} onClick={goTransactions}>
          📊 Transactions
        </div>

        <div style={styles.menuBtn} onClick={openWhatsApp}>
          💬 Support
        </div>

        <div style={styles.menuBtn}>
          ℹ️ About (Coming soon)
        </div>

        <div style={styles.menuBtn}>
          📘 Instructions (Coming soon)
        </div>

        {user?.$id === ADMIN_ID && (
          <div style={styles.adminBtn} onClick={goAdmin}>
            🛠 Admin Panel
          </div>
        )}

      </div>

      {/* LOGOUT */}
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
    background: "#0b1220",
    color: "white",
    padding: 15
  },

  header: {
    marginBottom: 15
  },

  title: {
    margin: 0,
    color: "gold"
  },

  balance: {
    opacity: 0.8
  },

  sectionTitle: {
    marginTop: 20,
    marginBottom: 10,
    color: "#cbd5e1"
  },

  gameGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12
  },

  gameCard: {
    padding: 15,
    borderRadius: 12,
    cursor: "pointer",
    color: "white",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)"
  },

  logo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5
  },

  menu: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },

  menuBtn: {
    padding: 14,
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 10,
    color: "white",
    fontWeight: "bold",
    cursor: "pointer"
  },

  adminBtn: {
    padding: 14,
    background: "purple",
    borderRadius: 10,
    color: "white",
    cursor: "pointer"
  },

  logout: {
    padding: 14,
    background: "red",
    border: "none",
    borderRadius: 10,
    color: "white",
    marginTop: 20,
    width: "100%"
  }
};