import { useEffect, useState } from "react";
import {
databases,
DATABASE_ID,
Query,
account,
CASINO_COLLECTION,
MATCH_COLLECTION,
GAME_COLLECTION
} from "../lib/appwrite";

export default function Transactions({ goBack }) {

const [records, setRecords] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
loadTransactions();
}, []);

const loadTransactions = async () => {
try {
const user = await account.get();
const userId = user.$id;

  // =========================
  // CASINO
  // =========================
  const casinoRes = await databases.listDocuments(
    DATABASE_ID,
    CASINO_COLLECTION,
    [
      Query.equal("userId", userId),
      Query.limit(20)
    ]
  );

  const casinoData = casinoRes.documents.map(doc => ({
    id: doc.$id,
    source: "casino",
    title: "🎡 Casino Spin",
    status: doc.status,
    amount: doc.netChange,
    createdAt: doc.$createdAt
  }));

  // =========================
  // MATCHES (OLD GAME)
  // =========================
  const matchRes = await databases.listDocuments(
    DATABASE_ID,
    MATCH_COLLECTION,
    [
      Query.equal("userId", userId),
      Query.limit(20)
    ]
  );

  const matchData = matchRes.documents.map(doc => ({
    id: doc.$id,
    source: "match",
    title: "🎯 Match Game",
    status: doc.status || "played",
    amount: doc.winAmount || 0,
    createdAt: doc.$createdAt
  }));

  // =========================
  // GAMES (GENERAL)
  // =========================
  const gameRes = await databases.listDocuments(
    DATABASE_ID,
    GAME_COLLECTION,
    [
      Query.equal("userId", userId),
      Query.limit(20)
    ]
  );

  const gameData = gameRes.documents.map(doc => ({
    id: doc.$id,
    source: "game",
    title: "🎮 Game",
    status: doc.status || "played",
    amount: doc.amount || 0,
    createdAt: doc.$createdAt
  }));

  // =========================
  // MERGE ALL
  // =========================
  const all = [
    ...casinoData,
    ...matchData,
    ...gameData
  ];

  // =========================
  // SORT (LATEST FIRST)
  // =========================
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  setRecords(all);

} catch (err) {
  console.error("Transaction load error:", err);
} finally {
  setLoading(false);
}

};

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
        {tx.title}
      </div>

      <div>
        Status: {tx.status}
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