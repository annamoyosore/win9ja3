import { useEffect, useState } from "react";
import { account, databases, DATABASE_ID, WALLET_COLLECTION, Query } from "../lib/appwrite";

export default function Wallet({ goTo }) {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const user = await account.get();

    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", user.$id)]
    );

    if (res.documents.length) {
      setWallet(res.documents[0]);
    }
  }

  return (
    <div style={styles.container}>
      <h1>💳 Wallet</h1>

      <div style={styles.card}>
        Balance: ${wallet?.balance || 0}
      </div>

      <button style={styles.btn}>➕ Deposit (coming)</button>
      <button style={styles.btn}>➖ Withdraw (coming)</button>

      <button style={styles.back} onClick={() => goTo("dashboard")}>
        ⬅ Back
      </button>
    </div>
  );
}

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
    borderRadius: 8
  },
  back: {
    marginTop: 20,
    padding: 10,
    background: "gray",
    border: "none",
    borderRadius: 8
  }
};