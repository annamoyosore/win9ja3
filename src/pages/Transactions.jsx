import { useEffect, useState } from "react";
import {
databases,
DATABASE_ID,
Query,
account,
CASINO_COLLECTION
} from "../lib/appwrite";

export default function Transactions({ goBack }) {

const [userId, setUserId] = useState(null);
const [records, setRecords] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
loadTransactions();
}, []);

const loadTransactions = async () => {
try {
const user = await account.get();
setUserId(user.$id);

  // =========================
  // FETCH CASINO SPINS
  // =========================
  const casinoRes = await databases.listDocuments(
    DATABASE_ID,
    CASINO_COLLECTION,
    [
      Query.equal("userId", user.$id),
      Query.orderDesc("$createdAt")
    ]
  );

  // =========================
  // FORMAT CASINO DATA
  // =========================
  const casinoData = casinoRes.documents.map(doc => ({
    id: doc.$id,
    type: "casino",
    status: doc.status,
    outcome: doc.outcome,
    amount: doc.netChange,
    balanceAfter: doc.balanceAfter,
    createdAt: doc.$createdAt
  }));

  // =========================
  // MERGE (add other collections later here)
  // =========================
  const all = [
    ...casinoData
  ];

  // =========================
  // SORT ALL RECORDS
  // =========================
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  setRecords(all);

} catch (err) {
  console.error("Transaction load error:", err);
} finally {
  setLoading(false);
}

};

// =========================
// UI RENDER
// =========================
return (
<div style={{ padding:20, color:"#fff" }}>

  <button onClick={goBack}>← Back</button>

  <h2>📜 Transactions</h2>

  {loading && <p>Loading...</p>}

  {!loading && records.length === 0 && (
    <p>No transactions yet</p>
  )}

  {records.map((tx) => (

    <div key={tx.id} style={{
      background:"#1a1a1a",
      padding:12,
      marginBottom:10,
      borderRadius:10,
      borderLeft:
        tx.status === "win" ? "5px solid gold" :
        tx.status === "lose" ? "5px solid red" :
        tx.status === "free" ? "5px solid purple" :
        "5px solid gray"
    }}>

      <div style={{ fontWeight:"bold" }}>
        🎡 Casino Spin
      </div>

      <div>
        Result: {tx.outcome}
      </div>

      <div>
        Status: {tx.status.toUpperCase()}
      </div>

      <div style={{
        color: tx.amount > 0 ? "lime" :
               tx.amount < 0 ? "red" : "#ccc",
        fontWeight:"bold"
      }}>
        ₦{tx.amount}
      </div>

      <div style={{ fontSize:12, opacity:0.7 }}>
        {new Date(tx.createdAt).toLocaleString()}
      </div>

    </div>

  ))}

</div>

);
}