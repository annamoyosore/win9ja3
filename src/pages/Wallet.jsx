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

  const [wallet, setWallet] = useState({
    balance: 0,
    locked: 0
  });

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

      // ✅ SAFE wallet load
      try {
        const w = await getWallet(user.$id);
        if (w) setWallet(w);
      } catch (err) {
        console.log("Wallet fetch failed, using fallback");
      }

      // ✅ SAFE promo load
      try {
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
        console.log("Promo fetch failed");
      }

    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // PROMO
  // =========================
  function generatePromoCode(name) {
    const clean = (name || "USER")
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 5);

    return clean + Math.floor(1000 + Math.random() * 9000);
  }

  async function createPromo() {
    if (processing) return;

    try {
      setProcessing(true);

      if (promoStats.code) {
        alert("You already have a promo code");
        return;
      }

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

  function inviteWhatsApp() {
    if (!promoStats.code) {
      alert("Generate your promo code first");
      return;
    }

    const message = `Join Win9ja 🎮\nUse my promo code: ${promoStats.code}\nhttps://win9jalife.vercel.app`;

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
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
        <p>💰 Balance: ₦{Number(wallet.balance).toLocaleString()}</p>
        <p>🔒 Locked: ₦{Number(wallet.locked).toLocaleString()}</p>
      </div>

      {/* ACTIONS */}
      <button style={styles.btn}>➕ Deposit</button>
      <button style={styles.btn}>➖ Withdraw</button>

      {/* BACK */}
      <button style={styles.back} onClick={() => navigate("/dashboard")}>
        ⬅ Back
      </button>

      {/* INVITE */}
      <button style={styles.inviteBtn} onClick={inviteWhatsApp}>
        📲 Invite via WhatsApp
      </button>

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