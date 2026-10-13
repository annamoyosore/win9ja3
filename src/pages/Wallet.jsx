import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account, databases, DATABASE_ID } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";
import { ID, Query } from "appwrite";

const PROMO_COLLECTION = "promocodes";
const WALLET_COLLECTION = "wallets";

export default function Wallet() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  // ========================================
  // LOAD USER AND WALLET
  // ========================================
  async function loadWallet() {
    setLoading(true);

    try {
      const currentUser = await account.get();
      setUser(currentUser);

      const walletData = await getWallet(currentUser.$id);
      setWallet(walletData);
    } catch (error) {
      console.error("Failed to load wallet:", error);
      setMessage("Unable to load your wallet. Please sign in again.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWallet();
  }, []);

  // ========================================
  // FORMAT COINS
  // ========================================
  function formatCoins(value) {
    const amount = Number(value ?? 0);

    return Number.isFinite(amount)
      ? amount.toLocaleString()
      : "0";
  }

  // ========================================
  // REDEEM PROMO CODE
  // ========================================
  async function redeemPromoCode(event) {
    event.preventDefault();

    setMessage("");

    const code = promoCode.trim().toUpperCase();

    if (!code) {
      setMessage("Please enter a promo code.");
      setMessageType("error");
      return;
    }

    if (!user || !wallet) {
      setMessage("Your wallet is not ready. Please refresh and try again.");
      setMessageType("error");
      return;
    }

    setRedeeming(true);

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        PROMO_COLLECTION,
        [
          Query.equal("code", code),
          Query.limit(1),
        ]
      );

      if (response.documents.length === 0) {
        setMessage("Invalid promo code.");
        setMessageType("error");
        return;
      }

      const promo = response.documents[0];

      if (promo.active === false) {
        setMessage("This promo code is no longer active.");
        setMessageType("error");
        return;
      }

      if (promo.expiresAt) {
        const expiryDate = new Date(promo.expiresAt);

        if (
          !Number.isNaN(expiryDate.getTime()) &&
          expiryDate.getTime() < Date.now()
        ) {
          setMessage("This promo code has expired.");
          setMessageType("error");
          return;
        }
      }

      const rewardCoins = Number(
        promo.coins ?? promo.rewardCoins ?? promo.amount ?? 0
      );

      if (!Number.isFinite(rewardCoins) || rewardCoins <= 0) {
        setMessage("This promo code has no valid coin reward.");
        setMessageType("error");
        return;
      }

      if (!wallet.$id) {
        setMessage(
          "Your wallet document ID could not be found. Please contact support."
        );
        setMessageType("error");
        return;
      }

      const currentCoins = Number(wallet.coins ?? 0);

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          coins: currentCoins + rewardCoins,
        }
      );

      setPromoCode("");
      setMessage(
        `Success! ${formatCoins(rewardCoins)} coins have been added to your wallet.`
      );
      setMessageType("success");

      await loadWallet();
    } catch (error) {
      console.error("Promo redemption failed:", error);

      setMessage(
        error?.message ||
          "Unable to redeem this promo code. Please try again."
      );
      setMessageType("error");
    } finally {
      setRedeeming(false);
    }
  }

  // ========================================
  // LOADING SCREEN
  // ========================================
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingCard}>
          <div style={styles.loadingIcon}>🪙</div>
          <h2>Loading Wallet</h2>
          <p>Please wait while we retrieve your coin balance.</p>
        </div>
      </div>
    );
  }

  // ========================================
  // WALLET PAGE
  // ========================================
  return (
    <div style={styles.page}>
      <main style={styles.container}>
        {/* HEADER */}
        <header style={styles.header}>
          <button
            type="button"
            style={styles.backButton}
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>

          <h1 style={styles.title}>My Wallet</h1>

          <p style={styles.subtitle}>
            Manage your Win9ja Life coins.
          </p>
        </header>

        {/* USER INFORMATION */}
        <section style={styles.userCard}>
          <div style={styles.avatar}>👤</div>

          <div style={styles.userInfo}>
            <h2 style={styles.userName}>
              {user?.name || "Win9ja User"}
            </h2>

            <p style={styles.userEmail}>
              {user?.email || "Email unavailable"}
            </p>
          </div>
        </section>

        {/* ALERT MESSAGE */}
        {message && (
          <div
            role={messageType === "error" ? "alert" : "status"}
            style={
              messageType === "error"
                ? styles.errorMessage
                : styles.successMessage
            }
          >
            {message}
          </div>
        )}

        {/* COIN BALANCE */}
        <section style={styles.balanceCard}>
          <div style={styles.balanceHeader}>
            <span style={styles.balanceLabel}>
              AVAILABLE COINS
            </span>

            <span style={styles.balanceIcon}>🪙</span>
          </div>

          <h2 style={styles.balance}>
            {formatCoins(wallet?.coins)}
          </h2>

          <p style={styles.balanceDescription}>
            Your Win9ja Life coin balance
          </p>

          <div style={styles.divider} />

          <div style={styles.lockedRow}>
            <span>🔒 Locked coins</span>

            <strong>
              {formatCoins(wallet?.lockedCoins)}
            </strong>
          </div>

          {/* BUY COINS */}
          <button
            type="button"
            style={styles.buyButton}
            onClick={() => navigate("/coins")}
          >
            🪙 Buy Win9ja Coins
          </button>

          {/* WITHDRAW COINS */}
          <button
            type="button"
            style={styles.withdrawButton}
            onClick={() => {
              window.location.href = "/withdraw.html";
            }}
          >
            💸 Withdraw Coins
          </button>
        </section>

        {/* WALLET ACTIONS */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Wallet Actions</h2>

          <div style={styles.actionGrid}>
            <button
              type="button"
              style={styles.actionCard}
              onClick={() => navigate("/coins")}
            >
              <span style={styles.actionIcon}>🪙</span>
              <span style={styles.actionTitle}>Coin Store</span>
              <span style={styles.actionDescription}>
                Purchase more coins
              </span>
            </button>

            <button
              type="button"
              style={styles.actionCard}
              onClick={() => {
                window.location.href = "/withdraw.html";
              }}
            >
              <span style={styles.actionIcon}>💸</span>
              <span style={styles.actionTitle}>Withdraw Coins</span>
              <span style={styles.actionDescription}>
                View withdrawal information
              </span>
            </button>

            <button
              type="button"
              style={styles.actionCard}
              onClick={() => navigate("/dashboard")}
            >
              <span style={styles.actionIcon}>🏠</span>
              <span style={styles.actionTitle}>Dashboard</span>
              <span style={styles.actionDescription}>
                Return to Win9ja Life
              </span>
            </button>
          </div>
        </section>

        {/* PROMO CODE */}
        <section style={styles.promoCard}>
          <div style={styles.promoHeading}>
            <span style={styles.promoIcon}>🎁</span>

            <div>
              <h2 style={styles.sectionTitle}>
                Redeem a Promo Code
              </h2>

              <p style={styles.promoDescription}>
                Enter an eligible code to receive bonus coins.
              </p>
            </div>
          </div>

          <form onSubmit={redeemPromoCode}>
            <label htmlFor="promo-code" style={styles.label}>
              Promo code
            </label>

            <div style={styles.promoForm}>
              <input
                id="promo-code"
                type="text"
                value={promoCode}
                onChange={(event) =>
                  setPromoCode(event.target.value.toUpperCase())
                }
                placeholder="ENTER CODE"
                maxLength={100}
                autoComplete="off"
                style={styles.input}
              />

              <button
                type="submit"
                disabled={redeeming}
                style={{
                  ...styles.redeemButton,
                  ...(redeeming ? styles.disabledButton : {}),
                }}
              >
                {redeeming ? "Checking..." : "Redeem"}
              </button>
            </div>
          </form>
        </section>

        {/* ACCOUNT INFORMATION */}
        <section style={styles.accountCard}>
          <h2 style={styles.sectionTitle}>Account Information</h2>

          <div style={styles.accountRow}>
            <span>Account ID</span>
            <strong>{user?.$id || "Unavailable"}</strong>
          </div>

          <div style={styles.accountRow}>
            <span>Wallet status</span>
            <strong>{wallet ? "Connected" : "Not found"}</strong>
          </div>
        </section>

        <footer style={styles.footer}>
          © {new Date().getFullYear()} Win9ja Life
        </footer>
      </main>
    </div>
  );
}

// ========================================
// INLINE STYLES
// ========================================
const styles = {
  page: {
    minHeight: "100vh",
    padding: "24px 14px",
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at top right, #dcfce7 0, #f8fafc 42%, #f1f5f9 100%)",
    color: "#172033",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },

  container: {
    maxWidth: "760px",
    margin: "0 auto",
  },

  loadingCard: {
    maxWidth: "420px",
    margin: "100px auto",
    padding: "35px 20px",
    background: "#ffffff",
    borderRadius: "20px",
    textAlign: "center",
    boxShadow: "0 15px 40px rgba(15, 23, 42, 0.08)",
  },

  loadingIcon: {
    fontSize: "45px",
    marginBottom: "10px",
  },

  header: {
    marginBottom: "25px",
  },

  backButton: {
    padding: "10px 15px",
    marginBottom: "18px",
    background: "#ffffff",
    color: "#166534",
    border: "1px solid #bbf7d0",
    borderRadius: "10px",
    fontWeight: 750,
    cursor: "pointer",
  },

  title: {
    margin: 0,
    fontSize: "clamp(27px, 5vw, 35px)",
    fontWeight: 850,
    letterSpacing: "-1px",
  },

  subtitle: {
    color: "#64748b",
    margin: "7px 0 0",
    fontSize: "14px",
  },

  userCard: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "18px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "17px",
    marginBottom: "18px",
  },

  avatar: {
    width: "48px",
    height: "48px",
    display: "grid",
    placeItems: "center",
    background: "#dcfce7",
    borderRadius: "15px",
    fontSize: "25px",
    flexShrink: 0,
  },

  userInfo: {
    minWidth: 0,
  },

  userName: {
    margin: 0,
    fontSize: "17px",
    fontWeight: 800,
    overflowWrap: "anywhere",
  },

  userEmail: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: "13px",
    overflowWrap: "anywhere",
  },

  errorMessage: {
    marginBottom: "18px",
    padding: "14px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    borderRadius: "12px",
    fontSize: "14px",
    lineHeight: 1.6,
  },

  successMessage: {
    marginBottom: "18px",
    padding: "14px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#166534",
    borderRadius: "12px",
    fontSize: "14px",
    lineHeight: 1.6,
  },

  balanceCard: {
    padding: "clamp(22px, 5vw, 32px)",
    borderRadius: "23px",
    color: "#ffffff",
    background:
      "linear-gradient(130deg, #14532d 0%, #15803d 60%, #22c55e 100%)",
    boxShadow: "0 18px 40px rgba(22, 101, 52, 0.18)",
  },

  balanceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  balanceLabel: {
    fontSize: "11px",
    letterSpacing: "1.8px",
    fontWeight: 850,
    color: "#bbf7d0",
  },

  balanceIcon: {
    fontSize: "30px",
  },

  balance: {
    fontSize: "clamp(38px, 9vw, 56px)",
    letterSpacing: "-1.5px",
    lineHeight: 1.1,
    margin: "17px 0 7px",
    fontWeight: 900,
    overflowWrap: "anywhere",
  },

  balanceDescription: {
    color: "#dcfce7",
    margin: 0,
    fontSize: "13px",
  },

  divider: {
    height: "1px",
    background: "rgba(255,255,255,0.22)",
    margin: "23px 0 17px",
  },

  lockedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "22px",
    color: "#dcfce7",
    fontSize: "14px",
  },

  buyButton: {
    width: "100%",
    padding: "15px",
    border: "none",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#166534",
    fontSize: "15px",
    fontWeight: 850,
    cursor: "pointer",
  },

  withdrawButton: {
    width: "100%",
    padding: "15px",
    marginTop: "12px",
    border: "1px solid #bbf7d0",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.12)",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 850,
    cursor: "pointer",
  },

  section: {
    marginTop: "30px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "19px",
    fontWeight: 850,
  },

  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
    gap: "14px",
    marginTop: "15px",
  },

  actionCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "7px",
    padding: "20px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    textAlign: "left",
    cursor: "pointer",
  },

  actionIcon: {
    fontSize: "27px",
    marginBottom: "5px",
  },

  actionTitle: {
    color: "#172033",
    fontWeight: 850,
    fontSize: "15px",
  },

  actionDescription: {
    color: "#64748b",
    fontSize: "12px",
  },

  promoCard: {
    marginTop: "30px",
    padding: "22px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
  },

  promoHeading: {
    display: "flex",
    alignItems: "flex-start",
    gap: "13px",
    marginBottom: "20px",
  },

  promoIcon: {
    fontSize: "28px",
  },

  promoDescription: {
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.6,
    margin: "7px 0 0",
  },

  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "13px",
    fontWeight: 750,
  },

  promoForm: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },

  input: {
    flex: "1 1 180px",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "14px",
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    fontSize: "14px",
  },

  redeemButton: {
    flex: "0 0 auto",
    padding: "14px 22px",
    background: "#15803d",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    fontWeight: 800,
    cursor: "pointer",
  },

  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
  },

  accountCard: {
    marginTop: "25px",
    padding: "20px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
  },

  accountRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: "8px",
    padding: "13px 0",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "12px",
  },

  footer: {
    padding: "28px 0 8px",
    color: "#94a3b8",
    textAlign: "center",
    fontSize: "12px",
  },
};