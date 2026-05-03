// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account, databases, DATABASE_ID } from "../lib/appwrite";
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

  const [promoStats, setPromoStats] = useState({
    code: null,
    usedCount: 0
  });

  // Deposit states
  const [showDeposit, setShowDeposit] = useState(false);
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");

  // Withdraw states
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const user = await account.get();

      const w = await getWallet(user.$id);
      setWallet(w);

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

    if (!accountNumber || accountNumber.length < 10) {
      return alert("Enter valid account number");
    }

    if (!accountName) {
      return alert("Enter account name");
    }

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

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Loading wallet...</p>
      </div>
    );
  }

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

      {promoStats.code && (
        <p style={styles.usedText}>
          👥 {promoStats.usedCount} users joined
        </p>
      )}

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

      {/* ================= DEPOSIT MODAL ================= */}
      {showDeposit && (
        <div style={styles.modal}>
          <h3>Deposit</h3>

          <input
            placeholder="Min ₦200"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={styles.input}
          />

          <input
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
          />

          <button style={styles.btn} onClick={makeDeposit}>
            Make Payment
          </button>

          <button style={styles.cancel} onClick={() => setShowDeposit(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* ================= WITHDRAW MODAL ================= */}
      {showWithdraw && (
        <div style={styles.modal}>
          <h3>Withdraw</h3>

          <input
            placeholder="Min ₦1500"
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            style={styles.input}
          />

          <input
            placeholder="Bank Name"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            style={styles.input}
          />

          <input
            placeholder="Account Number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            style={styles.input}
          />

          <input
            placeholder="Account Name"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            style={styles.input}
          />

          <button style={styles.btn} onClick={requestWithdraw}>
            Submit Request
          </button>

          <button style={styles.cancel} onClick={() => setShowWithdraw(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* BACK */}
      <button style={styles.back} onClick={() => navigate("/dashboard")}>
        ⬅ Back
      </button>

      {/* INVITE TEXT */}
      {promoStats.code && (
        <div style={styles.inviteBox}>
          <p style={styles.inviteText}>
            Join Win9ja and earn rewards 🎮{"\n"}
            Use my promo code: {promoStats.code}{"\n"}
            https://win9jalife.vercel.app
          </p>

          <button
            style={styles.copyInviteBtn}
            onClick={() => {
              const text = `Join Win9ja and earn rewards 🎮\nUse my promo code: ${promoStats.code}\nhttps://win9jalife.vercel.app`;
              navigator.clipboard.writeText(text);
              alert("Invite text copied ✅");
            }}
          >
            📋 Copy Invite
          </button>
        </div>
      )}

      {/* WHATSAPP GROUP */}
      <a
        href="https://chat.whatsapp.com/JX0vmuEcEUvLeYCXVIBn1L"
        target="_blank"
        rel="noreferrer"
        style={styles.whatsapp}
      >
        💬 Join WhatsApp Updates Group
      </a>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    paddingBottom: 80,
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
  usedText: {
    fontSize: 12,
    color: "#9ca3af"
  },
  card: {
    padding: 20,
    background: "#111827",
    borderRadius: 10,
    marginTop: 20
  },
  btn: {
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "gold",
    border: "none",
    borderRadius: 8
  },
  modal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#111827",
    padding: 20,
    borderRadius: 10,
    width: "85%",
    maxWidth: 320,
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 6,
    border: "none"
  },
  cancel: {
    padding: 10,
    background: "#ef4444",
    border: "none",
    borderRadius: 6,
    color: "#fff"
  },
  back: {
    marginTop: 20,
    padding: 10
  },
  inviteBox: {
    marginTop: 20,
    background: "#111827",
    padding: 12,
    borderRadius: 8
  },
  inviteText: {
    fontSize: 13,
    color: "#e5e7eb",
    whiteSpace: "pre-line",
    marginBottom: 10
  },
  copyInviteBtn: {
    width: "100%",
    padding: 10,
    background: "#22c55e",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontWeight: "bold"
  },
  whatsapp: {
    position: "fixed",
    bottom: 0,
    width: "100%",
    padding: 14,
    background: "#128C7E",
    textAlign: "center",
    color: "#fff"
  }
};