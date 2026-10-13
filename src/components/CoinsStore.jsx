import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account, databases, DATABASE_ID } from "../lib/appwrite";
import { ID, Query } from "appwrite";

// ========================================
// APPWRITE COLLECTIONS
// ========================================
const WALLET_COLLECTION = "wallets";
const PURCHASE_COLLECTION = "deposit_requests";

// ========================================
// COUNTRY PAYMENT CONFIGURATION
// Add your real Flutterwave payment links.
// ========================================
const PAYMENT_CONFIG = {
  NG: {
    name: "Nigeria",
    currency: "NGN",
    symbol: "₦",
    url:         "https://flutterwave.com/pay/qiattof2hy2w",
  },
  US: {
    name: "United States",
    currency: "USD",
    symbol: "$",
    url: "https://flutterwave.com/pay/qiattof2hy2w",
  },
  GB: {
    name: "United Kingdom",
    currency: "GBP",
    symbol: "£",
    url: "",
  },
  GH: {
    name: "Ghana",
    currency: "GHS",
    symbol: "GH₵",
    url: "",
  },
  KE: {
    name: "Kenya",
    currency: "KES",
    symbol: "KSh",
    url: "",
  },
  ZA: {
    name: "South Africa",
    currency: "ZAR",
    symbol: "R",
    url: "",
  },
  CA: {
    name: "Canada",
    currency: "CAD",
    symbol: "C$",
    url: "",
  },
};

// ========================================
// COIN PACKAGES
// These prices are examples.
// Adjust them to match your actual pricing.
// ========================================
const COIN_PACKAGES = [
  {
    id: "coins_500",
    coins: 500,
    prices: {
      NGN: 750,
      USD: 0.5,
      GBP: 0.4,
      GHS: 7,
      KES: 65,
      ZAR: 9,
      CAD: 0.7,
    },
  },
  {
    id: "coins_1000",
    coins: 1000,
    prices: {
      NGN: 1500,
      USD: 1,
      GBP: 0.8,
      GHS: 14,
      KES: 130,
      ZAR: 18,
      CAD: 1.4,
    },
  },
  {
    id: "coins_2500",
    coins: 2500,
    prices: {
      NGN: 3750,
      USD: 2.5,
      GBP: 2,
      GHS: 35,
      KES: 325,
      ZAR: 45,
      CAD: 3.5,
    },
  },
  {
    id: "coins_5000",
    coins: 5000,
    prices: {
      NGN: 7500,
      USD: 5,
      GBP: 4,
      GHS: 70,
      KES: 650,
      ZAR: 90,
      CAD: 7,
    },
  },
];

// ========================================
// HELPER: READ A PHONE NUMBER FROM WALLET
// ========================================
function extractWalletPhone(wallet) {
  if (!wallet) return "";

  const possibleFields = [
    "phoneNumber",
    "phone",
    "mobile",
    "telephone",
  ];

  for (const field of possibleFields) {
    const value = wallet[field];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

// ========================================
// HELPER: FORMAT PRICE
// ========================================
function formatPrice(amount, currency) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

// ========================================
// MAIN COMPONENT
// ========================================
export default function CoinsStore() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [userPhone, setUserPhone] = useState("");
  const [country, setCountry] = useState("NG");

  const [selectedPackage, setSelectedPackage] = useState(null);

  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentCountry = PAYMENT_CONFIG[country];

  const selectedAmount = selectedPackage
    ? selectedPackage.prices[currentCountry.currency]
    : 0;

  // ========================================
  // LOAD USER AND PHONE FROM WALLET
  // ========================================
  useEffect(() => {
    let cancelled = false;

    async function loadUserAndWallet() {
      setLoading(true);
      setError("");

      try {
        const currentUser = await account.get();

        if (cancelled) return;

        setUser(currentUser);

        // Find the logged-in user's wallet.
        const walletResponse = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal("userId", currentUser.$id),
            Query.limit(1),
          ]
        );

        if (cancelled) return;

        const wallet = walletResponse.documents[0];

        if (wallet) {
          const phone = extractWalletPhone(wallet);

          if (phone) {
            setUserPhone(phone);
          }
        }
      } catch (err) {
        console.error("Could not load user or wallet:", err);

        if (!cancelled) {
          setError(
            "We could not load your account details. Please sign in again and try."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUserAndWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  // ========================================
  // OPEN FLUTTERWAVE PAYMENT LINK
  // ========================================
  function openPaymentPage(coinPackage) {
    setError("");
    setSuccess("");

    const paymentUrl = PAYMENT_CONFIG[country].url;

    if (!paymentUrl) {
      setError(
        `The ${PAYMENT_CONFIG[country].name} payment link has not been configured yet.`
      );
      return;
    }

    setSelectedPackage(coinPackage);
    setPaymentReference("");
    setPaymentNote("");

    window.open(paymentUrl, "_blank", "noopener,noreferrer");
  }

  // ========================================
  // SUBMIT PURCHASE FOR ADMIN VERIFICATION
  // ========================================
  async function submitPurchase(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!user) {
      setError("Please sign in before purchasing coins.");
      return;
    }

    if (!selectedPackage) {
      setError("Please select a coin package first.");
      return;
    }

    if (!userPhone) {
      setError(
        "No phone number was found in your wallet. Please update your wallet profile before purchasing coins."
      );
      return;
    }

    if (!paymentReference.trim()) {
      setError(
        "Enter your Flutterwave transaction reference before submitting."
      );
      return;
    }

    const amount = selectedPackage.prices[currentCountry.currency];

    if (typeof amount !== "number" || amount <= 0) {
      setError("The price for this package is not configured correctly.");
      return;
    }

    setSubmitting(true);

    try {
      await databases.createDocument(
        DATABASE_ID,
        PURCHASE_COLLECTION,
        ID.unique(),
        {
          userId: user.$id,
          userEmail: user.email || "",

          // Automatically extracted from the user's wallet.
          userPhone: userPhone,

          packageId: selectedPackage.id,
          coins: selectedPackage.coins,

          amount: amount,
          currency: currentCountry.currency,
          country: country,

          paymentProvider: "flutterwave",
          paymentReference: paymentReference.trim(),
          paymentNote: paymentNote.trim(),

          // Admin must verify payment before approving.
          status: "pending",
        }
      );

      setSuccess(
        "Your coin purchase request has been submitted. Your payment will be verified by the administrator before coins are credited."
      );

      setSelectedPackage(null);
      setPaymentReference("");
      setPaymentNote("");
    } catch (err) {
      console.error("Coin purchase submission failed:", err);

      setError(
        err?.message ||
          "Unable to submit your purchase request. Please check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ========================================
  // LOADING SCREEN
  // ========================================
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner}>🪙</div>
          <h2>Loading Coin Store</h2>
          <p>Preparing your account...</p>
        </div>
      </div>
    );
  }

  // ========================================
  // PAGE
  // ========================================
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* HEADER */}
        <header style={styles.header}>
          <button
            type="button"
            onClick={() => navigate("/wallet")}
            style={styles.backButton}
          >
            ← Wallet
          </button>

          <div style={styles.brand}>
            <div style={styles.brandIcon}>🪙</div>

            <div>
              <h1 style={styles.title}>Win9ja Coin Store</h1>
              <p style={styles.subtitle}>
                Get coins for your Win9ja Life experience.
              </p>
            </div>
          </div>
        </header>

        {/* INTRO */}
        <section style={styles.hero}>
          <div style={styles.heroText}>
            <span style={styles.eyebrow}>WIN9JA LIFE</span>

            <h2 style={styles.heroTitle}>
              Power your experience with coins
            </h2>

            <p style={styles.heroDescription}>
              Choose a package, make your payment, and submit your transaction
              reference for verification.
            </p>
          </div>

          <div style={styles.coinIllustration}>
            <div style={styles.coinStack}>🪙</div>
            <div style={styles.coinSmall}>🪙</div>
            <div style={styles.coinSmallTwo}>🪙</div>
          </div>
        </section>

        {/* ERROR */}
        {error && (
          <div role="alert" style={styles.errorBox}>
            {error}
          </div>
        )}

        {/* SUCCESS */}
        {success && (
          <div role="status" style={styles.successBox}>
            {success}
          </div>
        )}

        {/* COUNTRY SELECTOR */}
        <section style={styles.section}>
          <div style={styles.sectionHeading}>
            <h2 style={styles.sectionTitle}>Choose your country</h2>

            <p style={styles.sectionDescription}>
              Select your payment currency.
            </p>
          </div>

          <select
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setSelectedPackage(null);
              setError("");
              setSuccess("");
            }}
            style={styles.select}
            aria-label="Choose your country"
          >
            {Object.entries(PAYMENT_CONFIG).map(([code, config]) => (
              <option key={code} value={code}>
                {config.name} ({config.currency})
              </option>
            ))}
          </select>
        </section>

        {/* COIN PACKAGES */}
        <section style={styles.section}>
          <div style={styles.sectionHeading}>
            <h2 style={styles.sectionTitle}>Choose a coin package</h2>

            <p style={styles.sectionDescription}>
              Select the package that suits you.
            </p>
          </div>

          <div style={styles.packageGrid}>
            {COIN_PACKAGES.map((coinPackage, index) => {
              const amount =
                coinPackage.prices[currentCountry.currency];

              const isSelected =
                selectedPackage?.id === coinPackage.id;

              return (
                <article
                  key={coinPackage.id}
                  style={{
                    ...styles.packageCard,
                    ...(isSelected ? styles.selectedPackage : {}),
                  }}
                >
                  {index === 1 && (
                    <span style={styles.popularBadge}>POPULAR</span>
                  )}

                  <div style={styles.packageCoin}>🪙</div>

                  <h3 style={styles.coinAmount}>
                    {coinPackage.coins.toLocaleString()} Coins
                  </h3>

                  <p style={styles.packageDescription}>
                    Win9ja virtual coins
                  </p>

                  <div style={styles.price}>
                    {formatPrice(amount, currentCountry.currency)}
                  </div>

                  <button
                    type="button"
                    style={styles.buyButton}
                    onClick={() => openPaymentPage(coinPackage)}
                  >
                    Buy Coins
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* PURCHASE FORM */}
        {selectedPackage && (
          <section style={styles.purchasePanel}>
            <h2 style={styles.sectionTitle}>
              Complete Your Purchase Request
            </h2>

            <p style={styles.sectionDescription}>
              You selected{" "}
              <strong>
                {selectedPackage.coins.toLocaleString()} coins
              </strong>{" "}
              for{" "}
              <strong>
                {formatPrice(
                  selectedAmount,
                  currentCountry.currency
                )}
              </strong>
              .
            </p>

            <div style={styles.notice}>
              <strong>Payment instructions</strong>

              <p style={styles.noticeText}>
                Complete the payment using the payment page opened in a new
                tab. After paying, return here and enter your transaction
                reference. Your coins will remain pending until the
                administrator verifies the payment.
              </p>
            </div>

            {/* ACCOUNT IDENTIFICATION */}
            <div style={styles.identityCard}>
              <h3 style={styles.identityTitle}>
                Purchaser Information
              </h3>

              <div style={styles.identityRow}>
                <span style={styles.identityLabel}>Account email</span>
                <span style={styles.identityValue}>
                  {user?.email || "Not available"}
                </span>
              </div>

              <div style={styles.identityRow}>
                <span style={styles.identityLabel}>Account ID</span>
                <span style={styles.identityValue}>
                  {user?.$id || "Not available"}
                </span>
              </div>

              <div style={styles.identityRow}>
                <span style={styles.identityLabel}>Wallet phone</span>
                <span style={styles.identityValue}>
                  {userPhone || "No phone number saved in wallet"}
                </span>
              </div>
            </div>

            <form onSubmit={submitPurchase}>
              <div style={styles.formGroup}>
                <label
                  htmlFor="payment-reference"
                  style={styles.label}
                >
                  Flutterwave transaction reference
                </label>

                <input
                  id="payment-reference"
                  type="text"
                  value={paymentReference}
                  onChange={(event) =>
                    setPaymentReference(event.target.value)
                  }
                  placeholder="Enter your transaction reference"
                  required
                  maxLength={150}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="payment-note" style={styles.label}>
                  Additional payment details (optional)
                </label>

                <textarea
                  id="payment-note"
                  value={paymentNote}
                  onChange={(event) =>
                    setPaymentNote(event.target.value)
                  }
                  placeholder="Add any useful information about your payment"
                  rows={3}
                  maxLength={1000}
                  style={styles.textarea}
                />
              </div>

              <div style={styles.formButtons}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  onClick={() => {
                    setSelectedPackage(null);
                    setPaymentReference("");
                    setPaymentNote("");
                    setError("");
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  style={{
                    ...styles.submitButton,
                    ...(submitting ? styles.disabledButton : {}),
                  }}
                  disabled={submitting}
                >
                  {submitting
                    ? "Submitting..."
                    : "Submit for Verification"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* IMPORTANT INFORMATION */}
        <section style={styles.footerNotice}>
          <h3 style={styles.footerTitle}>Payment and coin approval</h3>

          <ul style={styles.footerList}>
            <li>
              Use the correct payment link for your selected country.
            </li>
            <li>
              Keep your payment reference for verification.
            </li>
            <li>
              Your account ID and wallet phone number are attached to your
              purchase request.
            </li>
            <li>
              Coins are not credited automatically by this page.
            </li>
            <li>
              An administrator must verify the actual payment before
              approving the request.
            </li>
          </ul>
        </section>

        <footer style={styles.footer}>
          © {new Date().getFullYear()} Win9ja Life
        </footer>
      </div>
    </div>
  );
}

// ========================================
// INLINE STYLES
// ========================================
const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, #dcfce7 0, #f8fafc 42%, #f1f5f9 100%)",
    color: "#172033",
    padding: "24px 14px",
    boxSizing: "border-box",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },

  container: {
    width: "100%",
    maxWidth: "1050px",
    margin: "0 auto",
  },

  loadingCard: {
    maxWidth: "420px",
    margin: "100px auto",
    background: "#ffffff",
    padding: "35px 20px",
    borderRadius: "20px",
    textAlign: "center",
    boxShadow: "0 15px 40px rgba(15, 23, 42, 0.08)",
  },

  spinner: {
    fontSize: "42px",
    marginBottom: "12px",
  },

  header: {
    marginBottom: "25px",
  },

  backButton: {
    background: "#ffffff",
    color: "#166534",
    border: "1px solid #bbf7d0",
    padding: "10px 15px",
    borderRadius: "10px",
    fontWeight: 700,
    cursor: "pointer",
    marginBottom: "20px",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: "13px",
  },

  brandIcon: {
    width: "52px",
    height: "52px",
    display: "grid",
    placeItems: "center",
    borderRadius: "16px",
    background: "#16a34a",
    fontSize: "28px",
    flexShrink: 0,
  },

  title: {
    margin: 0,
    fontSize: "clamp(22px, 4vw, 30px)",
    fontWeight: 850,
    letterSpacing: "-0.8px",
  },

  subtitle: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    padding: "clamp(24px, 5vw, 42px)",
    borderRadius: "25px",
    color: "#ffffff",
    background:
      "linear-gradient(125deg, #14532d 0%, #15803d 55%, #22c55e 100%)",
    boxShadow: "0 18px 40px rgba(22, 101, 52, 0.17)",
    overflow: "hidden",
  },

  heroText: {
    flex: "1 1 400px",
  },

  eyebrow: {
    display: "inline-block",
    color: "#bbf7d0",
    fontSize: "11px",
    letterSpacing: "2px",
    fontWeight: 800,
    marginBottom: "10px",
  },

  heroTitle: {
    fontSize: "clamp(25px, 5vw, 40px)",
    lineHeight: 1.15,
    letterSpacing: "-1px",
    margin: "0 0 12px",
    maxWidth: "540px",
  },

  heroDescription: {
    color: "#dcfce7",
    lineHeight: 1.7,
    margin: 0,
    maxWidth: "540px",
  },

  coinIllustration: {
    width: "160px",
    height: "140px",
    position: "relative",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },

  coinStack: {
    fontSize: "88px",
    filter: "drop-shadow(0 12px 10px rgba(0,0,0,0.2))",
  },

  coinSmall: {
    position: "absolute",
    fontSize: "35px",
    right: "0",
    top: "5px",
  },

  coinSmallTwo: {
    position: "absolute",
    fontSize: "30px",
    left: "0",
    bottom: "0",
  },

  errorBox: {
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "14px 16px",
    marginTop: "18px",
    lineHeight: 1.6,
  },

  successBox: {
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    borderRadius: "12px",
    padding: "14px 16px",
    marginTop: "18px",
    lineHeight: 1.6,
  },

  section: {
    marginTop: "32px",
  },

  sectionHeading: {
    marginBottom: "17px",
  },

  sectionTitle: {
    fontSize: "21px",
    margin: "0 0 6px",
    fontWeight: 800,
  },

  sectionDescription: {
    color: "#64748b",
    margin: 0,
    lineHeight: 1.6,
    fontSize: "14px",
  },

  select: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    color: "#172033",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "14px",
    fontSize: "15px",
    outlineOffset: "2px",
  },

  packageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
    gap: "16px",
  },

  packageCard: {
    position: "relative",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "19px",
    padding: "24px 18px 20px",
    textAlign: "center",
    boxShadow: "0 8px 25px rgba(15, 23, 42, 0.045)",
  },

  selectedPackage: {
    border: "2px solid #16a34a",
    boxShadow: "0 8px 30px rgba(22, 163, 74, 0.12)",
  },

  popularBadge: {
    position: "absolute",
    top: "10px",
    right: "10px",
    fontSize: "9px",
    letterSpacing: "0.6px",
    fontWeight: 900,
    color: "#166534",
    background: "#dcfce7",
    padding: "5px 7px",
    borderRadius: "20px",
  },

  packageCoin: {
    fontSize: "42px",
    marginBottom: "8px",
  },

  coinAmount: {
    margin: "0 0 6px",
    fontSize: "19px",
    fontWeight: 850,
  },

  packageDescription: {
    color: "#64748b",
    fontSize: "12px",
    margin: "0 0 18px",
  },

  price: {
    fontSize: "23px",
    fontWeight: 850,
    marginBottom: "18px",
    color: "#15803d",
  },

  buyButton: {
    width: "100%",
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    borderRadius: "11px",
    padding: "13px 12px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  purchasePanel: {
    marginTop: "32px",
    background: "#ffffff",
    padding: "clamp(20px, 4vw, 30px)",
    borderRadius: "20px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 12px 35px rgba(15, 23, 42, 0.06)",
  },

  notice: {
    marginTop: "20px",
    marginBottom: "22px",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#92400e",
    padding: "15px",
    borderRadius: "12px",
    lineHeight: 1.6,
  },

  noticeText: {
    margin: "7px 0 0",
    fontSize: "13px",
  },

  identityCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: "16px",
    borderRadius: "13px",
    marginBottom: "22px",
  },

  identityTitle: {
    margin: "0 0 12px",
    fontSize: "15px",
    fontWeight: 800,
  },

  identityRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "8px",
    padding: "9px 0",
    borderBottom: "1px solid #e2e8f0",
  },

  identityLabel: {
    fontSize: "13px",
    color: "#64748b",
  },

  identityValue: {
    fontSize: "13px",
    fontWeight: 700,
    overflowWrap: "anywhere",
    textAlign: "right",
    maxWidth: "65%",
  },

  formGroup: {
    marginBottom: "18px",
  },

  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: 750,
    marginBottom: "8px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px",
    border: "1px solid #cbd5e1",
    borderRadius: "11px",
    fontSize: "14px",
    outlineOffset: "2px",
    background: "#ffffff",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px",
    border: "1px solid #cbd5e1",
    borderRadius: "11px",
    fontSize: "14px",
    resize: "vertical",
    fontFamily: "inherit",
    outlineOffset: "2px",
    background: "#ffffff",
  },

  formButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "22px",
  },

  cancelButton: {
    flex: "1 1 130px",
    padding: "14px",
    background: "#f1f5f9",
    color: "#334155",
    border: "1px solid #e2e8f0",
    borderRadius: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },

  submitButton: {
    flex: "2 1 220px",
    padding: "14px",
    background: "#15803d",
    color: "#ffffff",
    border: "none",
    borderRadius: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },

  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
  },

  footerNotice: {
    marginTop: "30px",
    padding: "20px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
  },

  footerTitle: {
    margin: "0 0 12px",
    fontSize: "16px",
    fontWeight: 800,
  },

  footerList: {
    margin: 0,
    paddingLeft: "20px",
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.9,
  },

  footer: {
    textAlign: "center",
    padding: "25px 0 5px",
    color: "#94a3b8",
    fontSize: "12px",
  },
};