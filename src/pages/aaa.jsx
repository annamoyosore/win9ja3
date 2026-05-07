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

// 🔒 SECURITY ADMIN LOGIN ID
const ADMIN_ID = "69ef9fe863a02a7490b4";

// 💰 ADMIN CASINO WALLET ID
const ADMIN_WALLET_ID = "69f2482600125d496354";

export default function AdminDashboard({ back }) {

  const [user, setUser] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [matches, setMatches] = useState([]);

  const [walletMap, setWalletMap] = useState({});
  const [casinoStats, setCasinoStats] = useState({
    totalStake: 0,
    totalWin: 0,
    reserve: 0,
    profit: 0
  });

  const [loading, setLoading] = useState(false);

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
    await loadWalletNames();
    await loadCasinoStats();
  }

  async function loadAll() {
    await Promise.all([
      loadDeposits(),
      loadWithdrawals(),
      loadMatches()
    ]);
  }

  // =========================
  // WALLET MAP (SAFE)
  // =========================
  async function loadWalletNames() {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        []
      );

      const map = {};

      res.documents.forEach(w => {
        map[w.userId] = w.name || "Unknown";
      });

      setWalletMap(map);

    } catch (err) {
      console.log("Wallet map error:", err);
    }
  }

  // =========================
  // CASINO STATS (FIXED)
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
        [Query.limit(100)]
      );

      let totalStake = 0;
      let totalWin = 0;

      res.documents.forEach(t => {
        totalStake += Number(t.stake || 0);
        totalWin += Number(t.win || 0);
      });

      setCasinoStats({
        totalStake,
        totalWin,
        reserve: Number(admin.casinoReserve || 0),
        profit: Number(admin.casinoProfit || 0)
      });

    } catch (err) {
      console.log(err);
    }
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
      [Query.orderDesc("$createdAt"), Query.limit(6)]
    );

    setMatches(
      res.documents.filter(m =>
        m.status !== "finished" &&
        m.status !== "cancelled"
      )
    );
  }

  async function getWallet(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userId)]
    );

    if (!res.documents.length) {
      throw new Error("Wallet not found");
    }

    return res.documents[0];
  }

  // =========================
  // CONFIRM ACTION HELPER
  // =========================
  function confirmAction(msg) {
    return window.confirm(msg);
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>

      <h1 style={styles.title}>🛠 Admin Dashboard</h1>

      {/* CASINO STATS */}
      <div style={styles.statsBox}>
        <h2>🎰 Casino Overview</h2>
        <p>💰 Reserve: ₦{casinoStats.reserve}</p>
        <p>📊 Total Stake: ₦{casinoStats.totalStake}</p>
        <p>🎁 Total Paid: ₦{casinoStats.totalWin}</p>
        <p>📈 Profit: ₦{casinoStats.profit}</p>
      </div>

      {/* DEPOSITS */}
      <h2>💰 Pending Deposits</h2>

      {deposits.map(d => (
        <div key={d.$id} style={styles.card}>
          <div>
            <strong>₦{d.amount}</strong>
            <div style={styles.subText}>
              {walletMap[d.userId] || "Unknown"} ({d.userId})
            </div>
          </div>

          <div>
            <button
              onClick={async () => {
                if (!confirmAction("Approve deposit?")) return;
                alert("Connect your approve logic here");
              }}
            >
              Approve
            </button>

            <button
              onClick={() => {
                if (!confirmAction("Reject deposit?")) return;
                alert("Reject logic here");
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      {/* WITHDRAWALS */}
      <h2>💸 Withdrawals</h2>

      {withdrawals.map(w => (
        <div key={w.$id} style={styles.card}>
          <div>
            <strong>₦{w.amount}</strong>
            <div style={styles.subText}>
              {walletMap[w.userId] || "Unknown"} ({w.userId})
            </div>
          </div>

          <div>
            <button
              onClick={() => {
                if (!confirmAction("Approve withdrawal?")) return;
                alert("Approve logic here");
              }}
            >
              Approve
            </button>

            <button
              onClick={() => {
                if (!confirmAction("Reject withdrawal?")) return;
                alert("Reject logic here");
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      {/* MATCHES */}
      <h2>🎮 Active Matches</h2>

      {matches.map(m => (
        <div key={m.$id} style={styles.card}>
          <div>
            <p>Stake: ₦{m.stake}</p>
            <p>Pot: ₦{m.pot}</p>
            <p>Status: {m.status}</p>
          </div>
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
  statsBox: {
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
    borderRadius: 8,
    alignItems: "center"
  },
  subText: {
    fontSize: 12,
    opacity: 0.7
  }
};