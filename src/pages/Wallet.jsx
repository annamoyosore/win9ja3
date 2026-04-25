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
export default function Wallet({ back }) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // LOAD WALLET
  // =========================
  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const user = await account.get();

      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", user.$id)]
      );

      if (res.documents.length) {
        setWallet(res.documents[0]);
      }
    } catch (err) {
      console.error("Wallet load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // LOADING UI
  // =========================
  if (loading) {
    return (
      <div style={styles.container}>
        <h2>💳 Wallet</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>💳 Wallet</h1>

      <div style={styles.card}>
        <p>💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}</p>
        <p>🔒 Locked: ₦{Number(wallet?.locked || 0).toLocaleString()}</p>
      </div>

      <button style={styles.btn}>
        ➕ Deposit (coming)
      </button>

      <button style={styles.btn}>
        ➖ Withdraw (coming)
      </button>

      {/* ✅ FIXED BACK BUTTON */}
      <button style={styles.back} onClick={back}>
        ⬅ Back
      </button>
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
    background: "#0f172a",
    color: "white",
    minHeight: "100vh"
  },
  card: {
    padding: 20,
    background: "#111827",
    borderRadius: 10,
    marginBottom: 20
  },
  btn: {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "gold",
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  },
  back: {
    marginTop: 20,
    padding: 10,
    background: "gray",
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  }
};