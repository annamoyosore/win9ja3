import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  PROMO_COLLECTION,
  ID,
  Query,
} from "../lib/appwrite";

import { getWallet } from "../lib/wallet";

// =====================================
// THEME-AWARE STYLES
// App.jsx controls the global theme.
// =====================================

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--app-bg, #07111f)",
    color: "var(--app-text, #ffffff)",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
    transition: "background 0.2s, color 0.2s",
  },

  container: {
    maxWidth: "760px",
    width: "100%",
    margin: "0 auto",
  },

  card: {
    background: "var(--app-card, #101e31)",
    border: "1px solid var(--app-border, #263951)",
    borderRadius: "14px",
    padding: "18px",
    marginTop: "16px",
    boxSizing: "border-box",
  },

  button: {
    width: "100%",
    minHeight: "46px",
    padding: "13px",
    marginTop: "10px",
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    borderRadius: "9px",
    fontWeight: "bold",
    cursor: "pointer",
  },

  secondaryButton: {
    width: "100%",
    minHeight: "46px",
    padding: "12px",
    marginTop: "10px",
    background: "var(--app-secondary, #263951)",
    color: "var(--app-text, #ffffff)",
    border: "1px solid var(--app-border, #344861)",
    borderRadius: "9px",
    cursor: "pointer",
  },

  input: {
    display: "block",
    width: "100%",
    minHeight: "46px",
    boxSizing: "border-box",
    padding: "12px",
    marginTop: "8px",
    marginBottom: "12px",
    background: "var(--app-input, #07111f)",
    color: "var(--app-text, #ffffff)",
    border: "1px solid var(--app-border, #344861)",
    borderRadius: "8px",
    fontSize: "16px",
  },

  muted: {
    color: "var(--app-muted, #a6b7cc)",
    fontSize: "13px",
    lineHeight: 1.6,
  },
};

// =====================================
// HELPERS
// =====================================

function formatCoins(value) {
  return Number(value || 0).toLocaleString("en-NG");
}

// =====================================
// WALLET COMPONENT
// =====================================

export default function Wallet() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [promo, setPromo] = useState(null);
  const [zangiContact, setZangiContact] = useState("");
  const [message, setMessage] = useState("");

  // =====================================
  // LOAD USER, WALLET AND PROMO
  // =====================================

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setMessage("");

      try {
        const currentUser = await account.get();

        const currentWallet = await getWallet(currentUser.$id);

        const promoResponse = await databases.listDocuments(
          DATABASE_ID,
          PROMO_COLLECTION,
          [
            Query.equal("ownerId", currentUser.$id),
            Query.limit(1),
          ]
        );

        if (!active) return;

        setUser(currentUser);
        setWallet(currentWallet);
        setZangiContact(currentWallet.zangiContact || "");
        setPromo(promoResponse.documents[0] || null);
      } catch (error) {
        console.error("Wallet loading failed:", error);

        if (active) {
          setMessage(
            "Unable to load your wallet. Please sign in and try again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  // =====================================
  // RELOAD WALLET
  // =====================================

  async function refreshWallet() {
    if (!user) return;

    try {
      const currentWallet = await getWallet(user.$id);
      setWallet(currentWallet);
      setMessage("");
    } catch (error) {
      console.error("Wallet refresh failed:", error);
      setMessage("Could not refresh your coin balance.");
    }
  }

  // =====================================
  // CREATE PROMO CODE
  // =====================================

  function generateCode(displayName) {
    const base = (
      displayName ||
      wallet?.name ||
      "USER"
    )
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 5);

    return base + Math.floor(1000 + Math.random() * 9000);
  }

  async function createPromo() {
    try {
      if (!user) {
        alert("Please sign in first.");
        return;
      }

      if (promo?.code) {
        alert("You already have a promo code.");
        return;
      }

      const code = generateCode(wallet?.name);

      const newPromo = await databases.createDocument(
        DATABASE_ID,
        PROMO_COLLECTION,
        ID.unique(),
        {
          code,
          ownerId: user.$id,
          usedCount: 0,
          isActive: true,
        }
      );

      setPromo(newPromo);

      alert("Promo code created successfully.");
    } catch (error) {
      console.error("Promo creation failed:", error);

      alert(
        `Could not create promo code: ${
          error.message || "Please try again."
        }`
      );
    }
  }

  // =====================================
  // COPY TEXT
  // =====================================

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied successfully.`);
    } catch {
      alert(
        "Copy failed. Please select and copy the text manually."
      );
    }
  }

  function copyPromoCode() {
    if (!promo?.code) {
      alert("Create a promo code first.");
      return;
    }

    copyText(promo.code, "Promo code");
  }

  function copyInvite() {
    if (!promo?.code) {
      alert("Create a promo code first.");
      return;
    }

    const inviteText = `
🎮 Join Win9ja Life!

Use Promo Code: ${promo.code}

🪙 Play games using Win9ja Coins.

Visit:
https://win9jalife.vercel.app

📲 Community Group:
https://chat.whatsapp.com/XXXXXXXX
    `.trim();

    copyText(inviteText, "Invitation");
  }

  // =====================================
  // SAVE ZANGI CONTACT
  // =====================================

  async function saveZangi() {
    try {
      if (!wallet?.$id) {
        alert("Wallet not found.");
        return;
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          zangiContact: zangiContact.trim(),
        }
      );

      alert("Zangi contact saved successfully.");

      await refreshWallet();
    } catch (error) {
      console.error("Saving Zangi contact failed:", error);

      alert(
        `Could not save Zangi contact: ${
          error.message || "Please try again."
        }`
      );
    }
  }

  // =====================================
  // LOADING
  // =====================================

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <h2>🪙 Win9ja Wallet</h2>
          <p>Loading your wallet...</p>
        </div>
      </main>
    );
  }

  // =====================================
  // LOGIN OR WALLET ERROR
  // =====================================

  if (!user || !wallet) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <h2>🪙 Win9ja Wallet</h2>

          <p>{message || "Please sign in to view your wallet."}</p>

          <button
            type="button"
            style={styles.button}
            onClick={() => navigate("/auth")}
          >
            Sign in
          </button>

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => navigate("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  // =====================================
  // MAIN WALLET UI
  // =====================================

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header>
          <h1>🪙 My Win9ja Wallet</h1>

          <p style={styles.muted}>
            Welcome, {wallet.name || user.name || "Player"}
          </p>
        </header>

        {message && (
          <div style={styles.card} role="status">
            {message}
          </div>
        )}

        {/* COIN BALANCE */}

        <section
          style={{
            ...styles.card,
            border: "1px solid #16a34a",
          }}
        >
          <p style={styles.muted}>YOUR AVAILABLE COINS</p>

          <h2
            style={{
              fontSize: "clamp(30px, 7vw, 42px)",
              color: "#22c55e",
              margin: "8px 0",
            }}
          >
            🪙 {formatCoins(wallet.coins)}
          </h2>

          <p style={styles.muted}>
            Use your coins to enter games. Your coin balance is
            separate from your old game-fund balance during migration.
          </p>

          <button
            type="button"
            style={styles.button}
            onClick={() => navigate("/coins")}
          >
            🪙 Buy Coins
          </button>

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={refreshWallet}
          >
            ↻ Refresh Coin Balance
          </button>

          {/* UPDATED: OPEN THE NEW WITHDRAW PAGE */}

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => navigate("/withdraw")}
          >
            💸 Request Coin Withdrawal
          </button>
        </section>

        {/* PURCHASE INFORMATION */}

        <section style={styles.card}>
          <h2>🛒 Purchase Coins</h2>

          <p style={styles.muted}>
            Select a coin package on the Buy Coins page. Follow the
            payment instructions and keep your payment reference.
          </p>

          <p style={styles.muted}>
            Coin purchases remain pending until the payment is verified
            and approved by the Win9ja Life administrator.
          </p>

          <button
            type="button"
            style={styles.button}
            onClick={() => navigate("/coins")}
          >
            View Coin Packages
          </button>
        </section>

        {/* PROMO CODES */}

        <section style={styles.card}>
          <h2>🎁 Promo Code</h2>

          {promo?.code ? (
            <>
              <p
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  color: "#22c55e",
                  overflowWrap: "anywhere",
                }}
              >
                {promo.code}
              </p>

              <p style={styles.muted}>
                Users joined: {promo.usedCount || 0}
              </p>

              <button
                type="button"
                style={styles.button}
                onClick={copyPromoCode}
              >
                📋 Copy Promo Code
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={copyInvite}
              >
                📤 Copy Invitation
              </button>
            </>
          ) : (
            <>
              <p style={styles.muted}>
                Create a promo code to share your Win9ja Life invitation.
              </p>

              <button
                type="button"
                style={styles.button}
                onClick={createPromo}
              >
                + Create Promo Code
              </button>
            </>
          )}
        </section>

        {/* ZANGI CONTACT */}

        <section style={styles.card}>
          <h2>💬 Zangi Contact</h2>

          <label htmlFor="zangiContact">
            Your Zangi contact
          </label>

          <input
            id="zangiContact"
            style={styles.input}
            value={zangiContact}
            onChange={(event) =>
              setZangiContact(event.target.value)
            }
            placeholder="Enter your Zangi contact"
          />

          <button
            type="button"
            style={styles.button}
            onClick={saveZangi}
          >
            Save Zangi Contact
          </button>
        </section>

        {/* NAVIGATION */}

        <section style={styles.card}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => navigate("/transactions")}
          >
            📜 View Transactions
          </button>

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => navigate("/dashboard")}
          >
            ← Back to Dashboard
          </button>
        </section>
      </div>
    </main>
  );
}