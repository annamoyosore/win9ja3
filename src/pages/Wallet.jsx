// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account, databases, DATABASE_ID } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";
import { ID, Query } from "appwrite";

const PROMO_COLLECTION = "promocodes";

export default function Wallet() {
  const navigate = useNavigate();

  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // ================= PROMO =================
  function generatePromoCode(name) {
    const safe = name || "USER";
    const clean = safe.replace(/\s+/g, "").toUpperCase().slice(0, 5);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return clean + rand;
  }

  async function createPromo() {
    if (processing) return;

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
      alert("Promo created ✅");

    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(promoStats.code);
    alert("Copied ✅");
  }

  function copyInviteText() {
    if (!promoStats.code) return alert("Generate code first");

    const text = `Join Win9ja 🎮\nUse my promo code: ${promoStats.code}\nhttps://win9jalife.vercel.app`;

    navigator.clipboard.writeText(text);
    alert("Invite copied ✅");
  }

  // ================= DEPOSIT =================
  async function makeDeposit() {
    if (!amount || Number(amount) < 200) {
      return alert("Minimum ₦200");
    }

    if (!name) {
      return alert("Enter full name");
    }

    try {
      const user = await account.get();

      await databases.createDocument(
        DATABASE_ID,
        "deposit_requests",
        ID.unique(),
        {
          userId: user.$id,
          amount: Number(amount),
          name,
          status: "pending"
        }
      );

      window.location.href = `https://flutterwave.com/pay/qiattof2hy2w`;

    } catch (err) {
      alert(err.message);
    }
  }

  // ================= WITHDRAW =================
  async function requestWithdraw() {
    if (!withdrawAmount || Number(withdrawAmount) < 1500) {
      return alert("Minimum ₦1500");
    }

    if (Number(withdrawAmount) > (wallet?.balance || 0)) {
      return alert("Insufficient balance");
    }

    if (!bank || !accountNumber || !accountName) {
      return alert("Fill all fields");
    }

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
          status: "pending"
        }
      );

      alert("Withdrawal sent ✅");

    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p style={{ color: "#fff" }}>Loading...</p>;

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <h2>💳 Wallet</h2>

        {promoStats.code ? (
          <div>
            <span>{promoStats.code}</span>
            <button onClick={copyCode}>📋</button>
          </div>
        ) : (
          <button onClick={createPromo}>+ Code</button>
        )}
      </div>

      {/* BALANCE */}
      <div style={styles.card}>
        <p>Balance: ₦{wallet?.balance}</p>
        <p>Locked: ₦{wallet?.locked}</p>
      </div>

      {/* ACTIONS */}
      <button style={styles.btn} onClick={() => setShowDeposit(true)}>
        Deposit
      </button>

      <button style={styles.btn} onClick={() => setShowWithdraw(true)}>
        Withdraw
      </button>

      {/* INVITE */}
      <button style={styles.inviteBtn} onClick={copyInviteText}>
        📋 Copy Invite Text
      </button>

      {/* MODALS */}
      {showDeposit && (
        <div style={styles.modal}>
          <input placeholder="Amount" onChange={e => setAmount(e.target.value)} />
          <input placeholder="Full Name" onChange={e => setName(e.target.value)} />
          <button onClick={makeDeposit}>Pay</button>
          <button onClick={() => setShowDeposit(false)}>Close</button>
        </div>
      )}

      {showWithdraw && (
        <div style={styles.modal}>
          <input placeholder="Amount" onChange={e => setWithdrawAmount(e.target.value)} />
          <input placeholder="Bank" onChange={e => setBank(e.target.value)} />
          <input placeholder="Account No" onChange={e => setAccountNumber(e.target.value)} />
          <input placeholder="Account Name" onChange={e => setAccountName(e.target.value)} />
          <button onClick={requestWithdraw}>Submit</button>
          <button onClick={() => setShowWithdraw(false)}>Close</button>
        </div>
      )}

      {/* WHATSAPP (BOTTOM FIXED) */}
      <a
        href="https://chat.whatsapp.com/YOUR_NEW_LINK_HERE"
        target="_blank"
        rel="noreferrer"
        style={styles.whatsapp}
      >
        💬 Join WhatsApp Updates Group
      </a>
    </div>
  );
}

// ================= STYLES =================
const styles = {
  container: {
    padding: 20,
    paddingBottom: 100,
    background: "#0f172a",
    color: "#fff",
    minHeight: "100vh"
  },
  header: {
    display: "flex",
    justifyContent: "space-between"
  },
  card: {
    background: "#111827",
    padding: 20,
    marginTop: 20
  },
  btn: {
    width: "100%",
    marginTop: 10,
    padding: 12,
    background: "gold"
  },
  inviteBtn: {
    marginTop: 15,
    width: "100%",
    padding: 12,
    background: "#25D366",
    color: "#fff"
  },
  modal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#111827",
    padding: 20
  },
  whatsapp: {
    position: "fixed",
    bottom: 0,
    width: "100%",
    background: "#128C7E",
    textAlign: "center",
    padding: 14,
    color: "#fff"
  }
};