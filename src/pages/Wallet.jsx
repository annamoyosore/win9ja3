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
  const [promo, setPromo] = useState(null);

  // Deposit
  const [showDeposit, setShowDeposit] = useState(false);
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  // Withdraw
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);

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
        setPromo(res.documents[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ================= PROMO =================
  function generateCode(name) {
    const base = (name || "USER")
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 5);

    return base + Math.floor(1000 + Math.random() * 9000);
  }

  async function createPromo() {
    try {
      const user = await account.get();
      const code = generateCode(wallet?.name);

      const doc = await databases.createDocument(
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

      setPromo(doc);
      alert("Promo created ✅");
    } catch (err) {
      alert(err.message);
    }
  }

  function copyCode() {
    if (!promo?.code) return;
    navigator.clipboard.writeText(promo.code);
    alert("Copied ✅");
  }

  function copyInvite() {
    if (!promo?.code) return alert("Generate code first");

    const text = `Join Win9ja 🎮
Use my promo code: ${promo.code}
https://win9jalife.vercel.app`;

    navigator.clipboard.writeText(text);
    alert("Invite copied ✅");
  }

  // ================= DEPOSIT =================
  async function makeDeposit() {
    if (depositLoading) return;

    if (!amount || Number(amount) < 200) {
      return alert("Minimum deposit ₦200");
    }

    if (!name) {
      return alert("Enter full name");
    }

    setDepositLoading(true);

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

      window.location.href =
        "https://flutterwave.com/pay/qiattof2hy2w";
    } catch (err) {
      alert(err.message);
    }

    setDepositLoading(false);
  }

  // ================= WITHDRAW =================
  async function requestWithdraw() {
    if (withdrawLoading) return;

    if (!withdrawAmount || Number(withdrawAmount) < 1500) {
      return alert("Minimum withdrawal ₦1500");
    }

    if (Number(withdrawAmount) > (wallet?.balance || 0)) {
      return alert("Insufficient balance");
    }

    if (!bank) return alert("Enter bank name");
    if (!accountNumber || accountNumber.length < 10)
      return alert("Enter valid account number");
    if (!accountName) return alert("Enter account name");

    setWithdrawLoading(true);

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

    setWithdrawLoading(false);
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <h2>💳 Wallet</h2>
        <p>Loading wallet...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1>
        💳 Wallet{" "}
        {promo ? (
          <>
            <span style={{ fontSize: 12 }}>{promo.code}</span>
            <span onClick={copyCode} style={{ cursor: "pointer" }}>
              {" "}
              📋
            </span>
          </>
        ) : (
          <span onClick={createPromo} style={{ cursor: "pointer" }}>
            +Code
          </span>
        )}
      </h1>

      {promo && (
        <p style={{ fontSize: 12 }}>
          👥 {promo.usedCount || 0} users joined
        </p>
      )}

      <div style={styles.card}>
        <p>💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}</p>
        <p>🔒 Locked: ₦{Number(wallet?.locked || 0).toLocaleString()}</p>
      </div>

      <button style={styles.btn} onClick={() => setShowDeposit(true)}>
        ➕ Deposit
      </button>

      <button style={styles.btn} onClick={() => setShowWithdraw(true)}>
        ➖ Withdraw
      </button>

      <button style={styles.btn} onClick={copyInvite}>
        📋 Copy Invite
      </button>

      {/* ================= DEPOSIT MODAL ================= */}
      {showDeposit && (
        <div style={styles.modal}>
          <div style={styles.card}>
            <h3>➕ Deposit</h3>

            <input
              style={styles.input}
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <button
              style={styles.btn}
              onClick={makeDeposit}
              disabled={depositLoading}
            >
              {depositLoading ? "Processing..." : "Proceed"}
            </button>

            <button
              style={styles.cancel}
              onClick={() => setShowDeposit(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ================= WITHDRAW MODAL ================= */}
      {showWithdraw && (
        <div style={styles.modal}>
          <div style={styles.card}>
            <h3>➖ Withdraw</h3>

            <input
              style={styles.input}
              placeholder="Amount"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Bank"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Account Number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Account Name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />

            <button
              style={styles.btn}
              onClick={requestWithdraw}
              disabled={withdrawLoading}
            >
              {withdrawLoading ? "Processing..." : "Submit"}
            </button>

            <button
              style={styles.cancel}
              onClick={() => setShowWithdraw(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
  card: {
    background: "#111827",
    padding: 20,
    borderRadius: 10,
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
  input: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    borderRadius: 6,
    border: "none"
  },
  cancel: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    background: "red",
    color: "white",
    border: "none",
    borderRadius: 8
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }
};