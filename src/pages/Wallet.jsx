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
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>💳 Wallet</h1>

      <div style={styles.card}>
        💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}
      </div>

      <button style={styles.btn}>➕ Deposit (coming)</button>
      <button style={styles.btn}>➖ Withdraw (coming)</button>

      {/* ✅ FIXED */}
      <button style={styles.back} onClick={back}>
        ⬅ Back
      </button>
    </div>
  );
}