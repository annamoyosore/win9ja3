import { useEffect, useState } from "react";
import { account, databases, DATABASE_ID, WALLET_COLLECTION, Query } from "../lib/appwrite";

export default function Dashboard({ goTo }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

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
      console.error(err);
    }
  }

  return (
    <div style={styles.container}>
      <h1>🎮 Win9ja</h1>

      <h2>Welcome, {user?.name}</h2>

      <div style={styles.card}>
        💰 Balance: ${wallet?.balance || 0}
      </div>

      <button style={styles.btn} onClick={() => goTo("wallet")}>
        💳 Wallet
      </button>

      <button style={styles.btn} onClick={() => goTo("game")}>
        🎲 Play WHOT
      </button>

      <div style={styles.games}>
        <h3>🚀 Coming Soon</h3>
        <p>Poker • Ludo • Blackjack</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    textAlign: "center",
    padding: 20,
    color: "white",
    background: "#0f172a",
    minHeight: "100vh"
  },
  card: {
    background: "#111827",
    padding: 20,
    margin: 10,
    borderRadius: 10
  },
  btn: {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "gold",
    border: "none",
    borderRadius: 8
  },
  games: {
    marginTop: 20,
    opacity: 0.7
  }
};