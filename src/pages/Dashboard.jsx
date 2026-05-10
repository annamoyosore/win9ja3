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
  goSnakeLobby, // ✅ ADDED (IMPORTANT FIX)
  logout
}) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  const [openMenu, setOpenMenu] = useState("games");

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
    const url = `https://wa.me/18622726355?text=Hello%20Support%2C%20I%20need%20help%20with%20my%20account`;
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

      {/* MENU */}
      <div style={styles.menu}>

        {/* GAMES */}
        <button
          style={styles.menuBtn}
          onClick={() => setOpenMenu(openMenu === "games" ? "" : "games")}
        >
          🎮 Games
        </button>

        {openMenu === "games" && (
          <div style={styles.dropdown}>
            <div style={styles.card} onClick={goLobby}>
              🎲 Play WHOT
            </div>

            <div style={styles.card} onClick={goCasino}>
              🎰 Casino Jackpot
            </div>

            {/* ✅ FIXED SNAKE NAVIGATION */}
            <div style={styles.card} onClick={goSnakeLobby}>
              🐍 Snake & Ladder
            </div>
          </div>
        )}

        {/* WALLET */}
        <button
          style={styles.menuBtn}
          onClick={() => setOpenMenu(openMenu === "wallet" ? "" : "wallet")}
        >
          💰 Wallet
        </button>

        {openMenu === "wallet" && (
          <div style={styles.dropdown}>
            <div style={styles.card} onClick={goWallet}>
              💳 Fund Wallet
            </div>

            <div style={styles.card} onClick={goTransactions}>
              📊 Transactions
            </div>
          </div>
        )}

        {/* SUPPORT */}
        <button
          style={styles.menuBtn}
          onClick={() => setOpenMenu(openMenu === "support" ? "" : "support")}
        >
          💬 Support
        </button>

        {openMenu === "support" && (
          <div style={styles.dropdown}>
            <div style={styles.card} onClick={openWhatsApp}>
              📞 Chat on WhatsApp
            </div>
          </div>
        )}

        {/* ABOUT THIS APP*/}
        <button style={styles.menuBtn}>
          ℹ️ About (Coming soon)
        </button>

        {/* GAME  INSTRUCTIONS */}
        <button style={styles.menuBtn}>
          📘 Instructions (Coming soon)
        </button>

        {/* ADMIN */}
        {user?.$id === ADMIN_ID && (
          <button style={styles.adminBtn} onClick={goAdmin}>
            🛠 Admin Panel
          </button>
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
    padding: 15,
    display: "flex",
    flexDirection: "column"
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

  menu: {
    flex: 1,
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
    textAlign: "left",
    fontWeight: "bold"
  },

  dropdown: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingLeft: 10
  },

  card: {
    background: "#1f2937",
    padding: 12,
    borderRadius: 10,
    cursor: "pointer"
  },

  adminBtn: {
    padding: 14,
    background: "purple",
    border: "none",
    borderRadius: 10,
    color: "white",
    marginTop: 10
  },

  logout: {
    padding: 14,
    background: "red",
    border: "none",
    borderRadius: 10,
    color: "white",
    marginTop: 20
  },

  loading: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    background: "#0b1220"
  }
};