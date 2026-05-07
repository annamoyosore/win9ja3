// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  Query,
  ID
} from "../lib/appwrite";

const DEPOSIT_COLLECTION = "deposit_requests";
const WITHDRAW_COLLECTION = "withdrawal_requests";
const MATCH_COLLECTION = "matches";
const TRANSACTION_COLLECTION = "transactions";
const CASINO_COLLECTION = "casino_records";

// 🔒 ADMIN IDS
const ADMIN_ID = "69ef9fe863a02a7490b4";
const ADMIN_WALLET_ID = "69f2482600125d496354";

// =========================
// COMPONENT
// =========================
export default function AdminDashboard({ back }) {

  const [user, setUser] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [matches, setMatches] = useState([]);

  const [walletMap, setWalletMap] = useState({});
  const [casinoStats, setCasinoStats] = useState({
    reserve: 0,
    profit: 0,
    totalStake: 0,
    totalWin: 0
  });

  const [loading, setLoading] = useState(false);

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();

    if (u.$id !== ADMIN_ID) {
      alert("Access denied");
      return;
    }

    setUser(u);

    await loadAll();
    await loadWalletMap();
    await loadCasinoStats();
  }

  // =========================
  // SAFE NUMBER HELPER
  // =========================
  const n = (v) => Number(v || 0);

  // =========================
  // WALLET MAP (SAFE FOR OLD USERS)
  // =========================
  async function loadWalletMap() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        []
      );

      const map = {};

      res.documents.forEach(w => {
        map[w.userId] = w.name || "Unknown User";
      });

      setWalletMap(map);

    } catch (err) {
      console.log("wallet map error", err);
    }
  }

  // =========================
  // CASINO STATS (FIXED SOURCE OF TRUTH)
  // =========================
  async function loadCasinoStats() {
    try {

      const admin = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID
      );

      const res = await databases.listDocuments(
        DATABASE_ID,
        CASINO_COLLECTION,
        [Query.limit(200)]
      );

      let totalStake = 0;
      let totalWin = 0;

      res.documents.forEach(r => {
        totalStake += n(r.stake);
        totalWin += n(r.win);
      });

      setCasinoStats({
        reserve: n(admin.casinoReserve),
        profit: n(admin.casinoProfit),
        totalStake,
        totalWin
      });

    } catch (err) {
      console.log("casino stats error", err);
    }
  }

  // =========================
  // LOAD ALL
  // =========================
  async function loadAll() {
    await Promise.all([
      loadDeposits(),
      loadWithdrawals(),
      loadMatches()
    ]);
  }

  async function loadDeposits() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      DEPOSIT_COLLECTION,
      [Query.equal("status", "pending")]
    );
    setDeposits(res.documents);
  }

  async function loadWithdrawals() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WITHDRAW_COLLECTION,
      [Query.equal("status", "pending")]
    );
    setWithdrawals(res.documents);
  }

  async function loadMatches() {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.orderDesc("$createdAt"), Query.limit(10)]
    );

    setMatches(
      res.documents.filter(
        m => m.status !== "finished" && m.status !== "cancelled"
      )
    );
  }

  // =========================
  // WALLET HELPER
  // =========================
  async function getWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
    );

    if (!res.documents.length) throw new Error("Wallet not found");

    return res.documents[0];
  }

  // =========================
  // CONFIRMATION POPUP
  // =========================
  const confirmAction = (msg) => window.confirm(msg);

  // =========================
  // APPROVE DEPOSIT
  // =========================
  async function approveDeposit(d) {
    if (!confirmAction("Approve this deposit?")) return;
    if (loading) return;

    setLoading(true);

    try {
      const wallet = await getWallet(d.userId);

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: n(wallet.balance) + n(d.amount)
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        d.$id,
        { status: "approved" }
      );

      loadDeposits();

    } catch (err) {
      alert(err.message);
    }

    setLoading(false);
  }

  // =========================
  // REJECT DEPOSIT
  // =========================
  async function rejectDeposit(d) {
    if (!confirmAction("Reject this deposit?")) return;

    await databases.updateDocument(
      DATABASE_ID,
      DEPOSIT_COLLECTION,
      d.$id,
      { status: "rejected" }
    );

    loadDeposits();
  }

  // =========================
  // APPROVE WITHDRAWAL
  // =========================
  async function approveWithdrawal(w) {
    if (!confirmAction("Approve withdrawal?")) return;
    if (loading) return;

    setLoading(true);

    try {
      const wallet = await getWallet(w.userId);

      if (n(wallet.balance) < n(w.amount)) {
        alert("Insufficient balance");
        return;
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          balance: n(wallet.balance) - n(w.amount)
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        w.$id,
        { status: "paid" }
      );

      loadWithdrawals();

    } catch (err) {
      alert(err.message);
    }

    setLoading(false);
  }

  // =========================
  // REJECT WITHDRAWAL
  // =========================
  async function rejectWithdrawal(w) {
    if (!confirmAction("Reject withdrawal?")) return;

    await databases.updateDocument(
      DATABASE_ID,
      WITHDRAW_COLLECTION,
      w.$id,
      { status: "rejected" }
    );

    loadWithdrawals();
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>

      <h1 style={styles.title}>🛠 Admin Dashboard</h1>

      {/* CASINO STATS */}
      <div style={styles.box}>
        <h2>🎰 Casino Overview</h2>
        <p>Reserve: ₦{casinoStats.reserve}</p>
        <p>Profit: ₦{casinoStats.profit}</p>
        <p>Total Stake: ₦{casinoStats.totalStake}</p>
        <p>Total Win: ₦{casinoStats.totalWin}</p>
      </div>

      {/* DEPOSITS */}
      <h2>💰 Deposits</h2>
      {deposits.map(d => (
        <div key={d.$id} style={styles.card}>
          <div>
            ₦{d.amount} <br />
            {walletMap[d.userId] || "Unknown"}
          </div>
          <div>
            <button onClick={() => approveDeposit(d)}>Approve</button>
            <button onClick={() => rejectDeposit(d)}>Reject</button>
          </div>
        </div>
      ))}

      {/* WITHDRAWALS */}
      <h2>💸 Withdrawals</h2>
      {withdrawals.map(w => (
        <div key={w.$id} style={styles.card}>
          <div>
            ₦{w.amount} <br />
            {walletMap[w.userId] || "Unknown"}
          </div>
          <div>
            <button onClick={() => approveWithdrawal(w)}>Approve</button>
            <button onClick={() => rejectWithdrawal(w)}>Reject</button>
          </div>
        </div>
      ))}

      {/* MATCHES */}
      <h2>🎮 Matches</h2>
      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          Stake ₦{m.stake} | Pot ₦{m.pot}
        </div>
      ))}

      <button onClick={back}>⬅ Back</button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    background: "#020617",
    color: "#fff",
    minHeight: "100vh"
  },
  title: {
    fontSize: 26,
    marginBottom: 10
  },
  box: {
    background: "#0f172a",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    border: "1px solid gold"
  },
  card: {
    background: "#111827",
    padding: 12,
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    borderRadius: 8
  }
};