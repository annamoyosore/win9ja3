// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account, databases, DATABASE_ID, WALLET_COLLECTION } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";
import { ID, Query } from "appwrite";

const PROMO_COLLECTION = "promocodes";

// =========================
// COMPONENT
// =========================
export default function Wallet() {
  const navigate = useNavigate();

  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  // 💬 ZANGI CONTACT STATE
  const [zangiContact, setZangiContact] = useState("");

  const [promoStats, setPromoStats] = useState({
    code: null,
    usedCount: 0
  });

  // Deposit
  const [showDeposit, setShowDeposit] = useState(false);
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");

  // Withdraw
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const [processing, setProcessing] = useState(false);

  // =========================
  // LOAD WALLET
  // =========================
  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const user = await account.get();

      const w = await getWallet(user.$id);
      setWallet(w);

      // 💬 load zangi contact from wallet
      setZangiContact(w?.zangiContact || "");

      const res = await databases.listDocuments(
        DATABASE_ID,
        PROMO_COLLECTION,
        [Query.equal("ownerId", user.$id)]
      );

      if (res.documents.length > 0) {
        const promo = res.documents[0];
        setPromoStats({
          code: promo.code,
          usedCount: promo.usedCount || 0
        });
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // SAVE ZANGI CONTACT
  // =========================
  async function saveZangi() {
    if (processing) return;
    if (!wallet) return;

    setProcessing(true);

    try {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          zangiContact: zangiContact
        }
      );

      alert("Zangi contact saved ✅");

    } catch (err) {
      alert(err.message);
    }

    setProcessing(false);
  }

  // =========================
  // PROMO CODE
  // =========================
  function generatePromoCode(name) {
    const safe = name || "USER";
    const clean = safe.replace(/\s+/g, "").toUpperCase().slice(0, 5);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return clean + rand;
  }

  async function createPromo() {
    if (processing) return;

    if (promoStats.code) {
      alert("You already have a promo code");
      return;
    }

    try {
      setProcessing(true);

      const user = await account.get();
      const code = generatePromoCode(wallet?.name);

      await databases.createDocument(
        DATABASE_ID,
        PROMO_COLLECTION,
        ID.unique(),
        {
          code,
          ownerId: user.$id,
          usedCount: 0,
          isActive: true
        }
      );

      setPromoStats({ code, usedCount: 0 });
      alert("Promo code created ✅");

    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  }

  function copyCode() {
    if (!promoStats.code) return;
    navigator.clipboard.writeText(promoStats.code);
    alert("Copied ✅");
  }

  // =========================
  // DEPOSIT
  // =========================
  async function makeDeposit() {
    if (processing) return;

    if (!amount || Number(amount) < 200) {
      return alert("Minimum deposit ₦200");
    }

    if (!name) {
      return alert("Enter full name");
    }

    setProcessing(true);

    try {
      const user = await account.get();
      const ref = "DEP-" + Date.now();

      await databases.createDocument(
        DATABASE_ID,
        "deposit_requests",
        ID.unique(),
        {
          userId: user.$id,
          amount: Number(amount),
          name,
          status: "pending",
          reference: ref,
          createdAt: new Date().toISOString()
        }
      );

      window.location.href = `https://flutterwave.com/pay/qiattof2hy2w`;

    } catch (err) {
      alert(err.message);
    }

    setProcessing(false);
  }

  // =========================
  // WITHDRAW
  // =========================
  async function requestWithdraw() {
    if (processing) return;

    if (!withdrawAmount || Number(withdrawAmount) < 1500) {
      return alert("Minimum withdrawal ₦1500");
    }

    if (Number(withdrawAmount) > (wallet?.balance || 0)) {
      return alert("Insufficient balance");
    }

    if (!bank) return alert("Enter bank name");
    if (!accountNumber || accountNumber.length < 10) return alert("Enter valid account number");
    if (!accountName) return alert("Enter account name");

    setProcessing(true);

    try {
      const user = await account.get();

      await databases.createDocument(
        DATABASE_ID,
        "withdrawal_requests",
        ID.unique(),
        {
          userId: user.$id,
          amount: Number(withdrawAmount),
          bank,
          accountNumber,
          accountName,
          status: "pending",
          createdAt: new Date().toISOString()
        }
      );

      alert("Withdrawal request sent");

      setShowWithdraw(false);
      setWithdrawAmount("");
      setBank("");
      setAccountNumber("");
      setAccountName("");

    } catch (err) {
      alert(err.message);
    }

    setProcessing(false);
  }

  // =========================
  // LOADING
  // =========================
  if (loading) {
    return (
      <div style={styles.container}>
        <p>Loading wallet...</p>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <h1>💳 Wallet</h1>

        <div style={styles.promoHeader}>
          {promoStats.code ? (
            <>
              <span style={styles.code}>{promoStats.code}</span>
              <button style={styles.copyBtn} onClick={copyCode}>📋</button>
            </>
          ) : (
            <button style={styles.genBtn} onClick={createPromo}>
              + Code
            </button>
          )}
        </div>
      </div>

      {/* 💬 ZANGI SECTION */}
      <div style={styles.card}>
        <h3>💬 Zangi Contact</h3>

        <input
          style={styles.input}
          placeholder="Enter Zangi number"
          value={zangiContact}
          onChange={(e) => setZangiContact(e.target.value)}
        />

        <button style={styles.btn} onClick={saveZangi}>
          💾 Save Contact
        </button>

        <a
          href="https://zangi.com/"
          target="_blank"
          rel="noreferrer"
          style={styles.link}
        >
          📥 Download Zangi App
        </a>
      </div>

      {/* WALLET */}
      <div style={styles.card}>
        <p>💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}</p>
        <p>🔒 Locked: ₦{Number(wallet?.locked || 0).toLocaleString()}</p>
      </div>

      {/* ACTIONS */}
      <button style={styles.btn} onClick={() => setShowDeposit(true)}>
        ➕ Deposit
      </button>

      <button style={styles.btn} onClick={() => setShowWithdraw(true)}>
        ➖ Withdraw
      </button>

      {/* BACK */}
      <button style={styles.back} onClick={() => navigate("/dashboard")}>
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
    padding: 20,
    background: "#0f172a",
    color: "white",
    minHeight: "100vh"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  promoHeader: {
    display: "flex",
    gap: 5
  },
  code: {
    background: "#111827",
    padding: "6px 10px",
    borderRadius: 6
  },
  copyBtn: {
    background: "#22c55e",
    border: "none",
    borderRadius: 6,
    padding: "6px 10px"
  },
  genBtn: {
    background: "gold",
    border: "none",
    borderRadius: 6,
    padding: "6px 10px"
  },
  card: {
    padding: 20,
    background: "#111827",
    borderRadius: 10,
    marginTop: 20
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 6,
    border: "none",
    marginTop: 10
  },
  btn: {
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "gold",
    border: "none",
    borderRadius: 8
  },
  back: {
    marginTop: 20,
    padding: 10
  },
  link: {
    display: "block",
    marginTop: 10,
    color: "#38bdf8",
    textDecoration: "none"
  }
};