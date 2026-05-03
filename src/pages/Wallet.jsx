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

  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const user = await account.get();
      const w = await getWallet(user.$id);
      setWallet(w);

      // Fetch promo
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

  // ================= GENERATE PROMO =================
  function generatePromoCode(name) {
    const clean = name.replace(/\s+/g, "").toUpperCase().slice(0, 5);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return clean + rand;
  }

  async function createPromo() {
    if (processing) return;

    try {
      setProcessing(true);

      const user = await account.get();

      const code = generatePromoCode(wallet.name);

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

      await databases.updateDocument(
        DATABASE_ID,
        wallet.$collectionId,
        wallet.$id,
        { promoOwned: code }
      );

      setPromoStats({ code, usedCount: 0 });

      alert("Promo code created ✅");

    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  }

  // ================= COPY =================
  function copyCode() {
    if (!promoStats.code) return;

    navigator.clipboard.writeText(promoStats.code);
    alert("Copied ✅");
  }

  // ================= LOADING =================
  if (loading) {
    return (
      <div style={styles.container}>
        <p>Loading wallet...</p>
      </div>
    );
  }

  // ================= UI =================
  return (
    <div style={styles.container}>
      
      {/* HEADER */}
      <div style={styles.header}>
        <h1>💳 Wallet</h1>

        <div style={styles.promoHeader}>
          {promoStats.code ? (
            <>
              <span style={styles.code}>{promoStats.code}</span>
              <button style={styles.copyBtn} onClick={copyCode}>
                📋
              </button>
            </>
          ) : (
            <button style={styles.genBtn} onClick={createPromo}>
              + Code
            </button>
          )}
        </div>
      </div>

      {/* PROMO STATS */}
      {promoStats.code && (
        <p style={styles.usedText}>
          👥 {promoStats.usedCount} users joined with your code
        </p>
      )}

      {/* WALLET CARD */}
      <div style={styles.card}>
        <p>💰 Balance: ₦{Number(wallet?.balance || 0).toLocaleString()}</p>
        <p>🔒 Locked: ₦{Number(wallet?.locked || 0).toLocaleString()}</p>
      </div>

      {/* ACTIONS */}
      <button style={styles.btn}>➕ Deposit</button>
      <button style={styles.btn}>➖ Withdraw</button>

      {/* BACK */}
      <button style={styles.back} onClick={() => navigate("/dashboard")}>
        ⬅ Back
      </button>

      {/* WHATSAPP */}
      <a
        href="https://chat.whatsapp.com/JX0vmuEcEUvLeYCXVIBn1L?mode=gi_t"
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
    alignItems: "center",
    gap: 5
  },

  code: {
    background: "#111827",
    padding: "6px 10px",
    borderRadius: 6,
    fontWeight: "bold"
  },

  copyBtn: {
    padding: "6px 10px",
    background: "#22c55e",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  genBtn: {
    padding: "6px 10px",
    background: "gold",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  usedText: {
    marginTop: 5,
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
    borderRadius: 8,
    fontWeight: "bold"
  },

  back: {
    marginTop: 20,
    padding: 10,
    background: "#475569",
    border: "none",
    borderRadius: 8,
    color: "#fff"
  },

  whatsapp: {
    position: "fixed",
    bottom: 0,
    left: 0,
    width: "100%",
    padding: 14,
    background: "linear-gradient(135deg, #25D366, #128C7E)",
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
    textDecoration: "none"
  }
};