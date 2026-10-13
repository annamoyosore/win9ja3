import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  DEPOSIT_COLLECTION,
  APP_SETTINGS_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

// =====================================
// PAYMENT CONFIGURATION
// =====================================

const PAYMENT_CONFIG = {
  NG: {
    label: "Nigeria",
    currency: "NGN",
    symbol: "₦",
    url: "https://flutterwave.com/pay/qiattof2hy2w"
  },

  US: {
    label: "United States",
    currency: "USD",
    symbol: "$",
    url: "https://flutterwave.com/pay/qiattof2hy2w"
  },

  GB: {
    label: "United Kingdom",
    currency: "GBP",
    symbol: "£",
    url: ""
  },

  GH: {
    label: "Ghana",
    currency: "GHS",
    symbol: "GH₵",
    url: ""
  },

  KE: {
    label: "Kenya",
    currency: "KES",
    symbol: "KSh",
    url: ""
  },

  ZA: {
    label: "South Africa",
    currency: "ZAR",
    symbol: "R",
    url: ""
  },

  CA: {
    label: "Canada",
    currency: "CAD",
    symbol: "C$",
    url: ""
  }
};

// =====================================
// COIN PACKAGES
// =====================================

const COIN_PACKAGES = [
  {
    id: "coins-500",
    coins: 500,
    prices: {
      NGN: 750,
      USD: 0.5,
      GBP: 0.4,
      GHS: 7,
      KES: 65,
      ZAR: 9,
      CAD: 0.7
    }
  },

  {
    id: "coins-1000",
    coins: 1000,
    prices: {
      NGN: 1500,
      USD: 1,
      GBP: 0.8,
      GHS: 14,
      KES: 130,
      ZAR: 18,
      CAD: 1.4
    }
  },

  {
    id: "coins-2500",
    coins: 2500,
    prices: {
      NGN: 3750,
      USD: 2.5,
      GBP: 2,
      GHS: 35,
      KES: 325,
      ZAR: 45,
      CAD: 3.5
    }
  },

  {
    id: "coins-5000",
    coins: 5000,
    prices: {
      NGN: 7500,
      USD: 5,
      GBP: 4,
      GHS: 70,
      KES: 650,
      ZAR: 90,
      CAD: 7
    }
  }
];

// =====================================
// THEME-AWARE STYLES
// Theme variables are controlled globally
// by App.jsx.
// =====================================

const styles = {
  page: {
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: "20px",
    background: "var(--app-bg, #07111f)",
    color: "var(--app-text, #ffffff)",
    fontFamily: "Arial, sans-serif",
    transition: "background 0.2s, color 0.2s"
  },

  container: {
    width: "100%",
    maxWidth: "850px",
    margin: "0 auto"
  },

  card: {
    background: "var(--app-card, #101e31)",
    border: "1px solid var(--app-border, #263951)",
    borderRadius: "16px",
    padding: "20px",
    marginTop: "18px",
    boxSizing: "border-box"
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    marginTop: "16px"
  },

  package: {
    width: "100%",
    minHeight: "150px",
    background: "var(--app-secondary, #12243a)",
    color: "var(--app-text, #ffffff)",
    border: "2px solid var(--app-border, #263951)",
    borderRadius: "12px",
    padding: "15px",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 0.2s, transform 0.2s"
  },

  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "13px",
    marginTop: "8px",
    marginBottom: "12px",
    background: "var(--app-input, #07111f)",
    color: "var(--app-text, #ffffff)",
    border: "1px solid var(--app-border, #344861)",
    borderRadius: "9px",
    fontSize: "16px"
  },

  button: {
    display: "block",
    width: "100%",
    minHeight: "48px",
    padding: "13px",
    marginTop: "12px",
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    fontWeight: "bold",
    fontSize: "15px",
    cursor: "pointer"
  },

  secondaryButton: {
    display: "block",
    width: "100%",
    minHeight: "46px",
    padding: "12px",
    marginTop: "12px",
    background: "var(--app-secondary, #263951)",
    color: "var(--app-text, #ffffff)",
    border: "1px solid var(--app-border, #344861)",
    borderRadius: "9px",
    fontWeight: "bold",
    cursor: "pointer"
  },

  muted: {
    color: "var(--app-muted, #a6b7cc)",
    fontSize: "13px",
    lineHeight: 1.7
  },

  message: {
    padding: "13px",
    borderRadius: "9px",
    marginTop: "14px",
    overflowWrap: "anywhere",
    lineHeight: 1.6
  },

  progressRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "7px",
    marginTop: "22px"
  },

  stepNumber: {
    width: "30px",
    height: "30px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    fontWeight: "bold",
    marginBottom: "7px"
  },

  paymentOption: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "15px",
    background: "var(--app-secondary, #07111f)",
    border: "1px solid var(--app-border, #263951)",
    borderRadius: "10px",
    marginTop: "12px",
    cursor: "pointer"
  }
};

// =====================================
// FORMAT PRICE
// =====================================

function formatPrice(amount, currency) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

// =====================================
// MAIN COMPONENT
// =====================================

export default function CoinsStore() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [country, setCountry] = useState("NG");

  const [selectedPackage, setSelectedPackage] = useState(
    COIN_PACKAGES[1]
  );

  const [paymentMethod, setPaymentMethod] = useState("card");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [trxAddress, setTrxAddress] = useState("");

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const currentCountry = PAYMENT_CONFIG[country];
  const amount = selectedPackage?.prices?.[currentCountry.currency];
  const isNigeria = country === "NG";

  // =====================================
  // HELPERS
  // =====================================

  function showMessage(text, type = "info") {
    setMessage(text);
    setMessageType(type);
  }

  function clearMessage() {
    setMessage("");
    setMessageType("info");
  }

  // =====================================
  // LOAD LOGGED-IN USER
  // =====================================

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const currentUser = await account.get();

        if (!active) return;

        setUser(currentUser);

        const walletResponse = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal("userId", currentUser.$id),
            Query.limit(1)
          ]
        );

        if (!active) return;

        const wallet = walletResponse.documents[0];

        if (wallet) {
          setUserPhone(
            wallet.phoneNumber ||
            wallet.phone ||
            wallet.mobile ||
            wallet.telephone ||
            ""
          );

          // Use a stored country only when it matches
          // one of the supported country codes.
          const savedCountry = String(
            wallet.countryCode || wallet.country || ""
          ).toUpperCase();

          if (PAYMENT_CONFIG[savedCountry]) {
            setCountry(savedCountry);
          }
        }
      } catch (error) {
        console.error("Unable to load user:", error);

        if (active) {
          showMessage(
            "Please sign in before purchasing coins.",
            "error"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  // =====================================
  // LOAD TRX ADDRESS
  // =====================================

  useEffect(() => {
    let active = true;

    async function loadTrxAddress() {
      if (paymentMethod !== "trx") {
        setTrxAddress("");
        return;
      }

      try {
        const response = await databases.listDocuments(
          DATABASE_ID,
          APP_SETTINGS_COLLECTION,
          [
            Query.equal("settingKey", "trx_address"),
            Query.limit(1)
          ]
        );

        if (!active) return;

        setTrxAddress(
          response.documents[0]?.settingValue || ""
        );
      } catch (error) {
        console.error("Could not load TRX settings:", error);

        if (active) setTrxAddress("");
      }
    }

    loadTrxAddress();

    return () => {
      active = false;
    };
  }, [paymentMethod]);

  // =====================================
  // STEP 1: SELECT COUNTRY
  // =====================================

  function continueFromCountry() {
    clearMessage();

    if (!user) {
      showMessage("Please sign in before purchasing coins.", "error");
      return;
    }

    setStep(2);
  }

  // =====================================
  // STEP 2: SELECT COIN PACKAGE
  // =====================================

  function continueFromPackage() {
    clearMessage();

    if (!selectedPackage) {
      showMessage("Please select a coin package.", "error");
      return;
    }

    if (!isNigeria && selectedPackage.coins < 1000) {
      showMessage(
        "International purchases must be at least 1,000 coins.",
        "error"
      );
      return;
    }

    setStep(3);
  }

  function selectPackage(coinPackage) {
    setSelectedPackage(coinPackage);
    setPaymentReference("");
    setPaymentNote("");
    clearMessage();
  }

  // =====================================
  // STEP 3: SELECT PAYMENT METHOD
  // =====================================

  function continueFromPaymentMethod() {
    clearMessage();

    if (paymentMethod === "card" && !currentCountry.url) {
      showMessage(
        `Card payments for ${currentCountry.label} have not been configured yet.`,
        "error"
      );
      return;
    }

    if (paymentMethod === "trx" && !trxAddress) {
      showMessage(
        "The TRX receiving address is not configured yet. Please contact support or select another payment method.",
        "error"
      );
      return;
    }

    setStep(4);
  }

  // =====================================
  // OPEN CARD PAYMENT PAGE
  // =====================================

  function openPaymentPage() {
    clearMessage();

    if (!user) {
      showMessage("Please sign in first.", "error");
      return;
    }

    if (!currentCountry.url) {
      showMessage(
        `Card payments for ${currentCountry.label} are not configured.`,
        "error"
      );
      return;
    }

    // Open the payment provider in a new tab.
    // The user must return to this page afterward.
    window.open(
      currentCountry.url,
      "_blank",
      "noopener,noreferrer"
    );

    showMessage(
      "Complete your payment in the new tab. Return here afterward and enter your payment reference.",
      "success"
    );
  }

  // =====================================
  // COPY TRX ADDRESS
  // =====================================

  async function copyTrxAddress() {
    if (!trxAddress) {
      showMessage(
        "The TRX receiving address is not configured yet.",
        "error"
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(trxAddress);

      showMessage("TRX address copied successfully.", "success");
    } catch {
      showMessage(
        "Copy failed. Select the address and copy it manually.",
        "error"
      );
    }
  }

  // =====================================
  // STEP 4: SUBMIT PURCHASE REQUEST
  //
  // Does not credit coins automatically.
  // Payment must be verified by an administrator.
  // =====================================

  async function submitPurchase() {
    if (submitting) return;

    clearMessage();

    if (!user) {
      showMessage("Please sign in first.", "error");
      return;
    }

    if (!selectedPackage) {
      showMessage("Please select a coin package.", "error");
      return;
    }

    if (!paymentReference.trim()) {
      showMessage(
        paymentMethod === "trx"
          ? "Enter your TRON transaction ID."
          : "Enter your payment reference.",
        "error"
      );
      return;
    }

    if (paymentMethod === "trx" && !trxAddress) {
      showMessage(
        "The TRX receiving address is not configured.",
        "error"
      );
      return;
    }

    if (paymentMethod === "card" && !currentCountry.url) {
      showMessage(
        "Card payment is not available for this country.",
        "error"
      );
      return;
    }

    if (!isNigeria && selectedPackage.coins < 1000) {
      showMessage(
        "The minimum international purchase is 1,000 coins.",
        "error"
      );
      return;
    }

    setSubmitting(true);

    try {
      await databases.createDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        ID.unique(),
        {
          userId: user.$id,
          userEmail: user.email || "",
          userPhone: userPhone || "",
          packageId: selectedPackage.id,
          coins: selectedPackage.coins,
          amount: Number(amount),
          currency: currentCountry.currency,
          country,
          paymentProvider:
            paymentMethod === "trx"
              ? "trx"
              : "flutterwave",
          paymentReference: paymentReference.trim(),
          paymentNote: paymentNote.trim(),
          status: "pending"
        }
      );

      showMessage(
        "Your purchase request has been submitted successfully. Your coins will be credited after an administrator verifies your payment.",
        "success"
      );

      setPaymentReference("");
      setPaymentNote("");
    } catch (error) {
      console.error("Purchase request failed:", error);

      showMessage(
        `Could not submit your request: ${
          error.message ||
          "Check the deposit_requests collection attributes and permissions in Appwrite."
        }`,
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  // =====================================
  // GO BACK ONE STEP
  // =====================================

  function previousStep() {
    clearMessage();
    setStep(current => Math.max(1, current - 1));
  }

  // =====================================
  // PROGRESS INDICATOR
  // =====================================

  const stepLabels = [
    "Country",
    "Amount",
    "Payment",
    "Complete"
  ];

  function renderProgress() {
    return (
      <div style={styles.progressRow}>
        {stepLabels.map((label, index) => {
          const stepNumber = index + 1;
          const active = step === stepNumber;
          const completed = step > stepNumber;

          return (
            <div
              key={label}
              style={{
                textAlign: "center",
                minWidth: 0,
                fontSize: "12px",
                color:
                  active || completed
                    ? "#22c55e"
                    : "var(--app-muted, #a6b7cc)"
              }}
            >
              <div
                style={{
                  ...styles.stepNumber,
                  background:
                    active || completed
                      ? "#16a34a"
                      : "var(--app-secondary, #263951)",
                  color: "#ffffff"
                }}
              >
                {completed ? "✓" : stepNumber}
              </div>

              <div>{label}</div>
            </div>
          );
        })}
      </div>
    );
  }

  // =====================================
  // LOADING
  // =====================================

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <h2>🪙 Win9ja Life</h2>
          <p>Loading coin store...</p>
        </div>
      </main>
    );
  }

  // =====================================
  // PAGE UI
  // =====================================

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        {/* TOP NAVIGATION */}

        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => navigate("/wallet")}
        >
          ← Back to Wallet
        </button>

        {/* HEADER */}

        <header style={{ textAlign: "center", marginTop: 25 }}>
          <div style={{ fontSize: 48 }}>🪙</div>

          <h1>Win9ja Life Coin Store</h1>

          <p style={styles.muted}>
            Buy coins in a few simple steps and use them to
            enter supported games.
          </p>
        </header>

        {/* PROGRESS */}

        {renderProgress()}

        {/* STATUS MESSAGE */}

        {message && (
          <div
            role="status"
            aria-live="polite"
            style={{
              ...styles.message,
              background: "var(--app-card, #101e31)",
              border:
                messageType === "error"
                  ? "1px solid #ef4444"
                  : messageType === "success"
                  ? "1px solid #22c55e"
                  : "1px solid #3b82f6"
            }}
          >
            {message}
          </div>
        )}

        {/* =================================
            STEP 1: COUNTRY
        ================================= */}

        {step === 1 && (
          <section style={styles.card}>
            <h2>🌍 Step 1: Select your country</h2>

            <p style={styles.muted}>
              Select your country so we can display the
              corresponding currency and available payment options.
            </p>

            <label htmlFor="country">
              Country of payment
            </label>

            <select
              id="country"
              style={styles.input}
              value={country}
              onChange={event => {
                const nextCountry = event.target.value;

                setCountry(nextCountry);

                setSelectedPackage(current => {
                  if (
                    nextCountry !== "NG" &&
                    current.coins < 1000
                  ) {
                    return COIN_PACKAGES[1];
                  }

                  return current;
                });

                setPaymentReference("");
                setPaymentNote("");
                clearMessage();
              }}
            >
              {Object.entries(PAYMENT_CONFIG).map(
                ([code, config]) => (
                  <option key={code} value={code}>
                    {config.label} ({config.currency})
                  </option>
                )
              )}
            </select>

            <div
              style={{
                ...styles.card,
                marginTop: 8,
                background: "var(--app-secondary, #12243a)"
              }}
            >
              <p style={styles.muted}>Selected country</p>

              <h3>{currentCountry.label}</h3>

              <p>
                Currency: <strong>{currentCountry.currency}</strong>
              </p>
            </div>

            <button
              type="button"
              style={styles.button}
              onClick={continueFromCountry}
            >
              Next: Choose Coin Amount →
            </button>
          </section>
        )}

        {/* =================================
            STEP 2: COIN AMOUNT
        ================================= */}

        {step === 2 && (
          <section style={styles.card}>
            <h2>🪙 Step 2: Choose your coin amount</h2>

            <p style={styles.muted}>
              Country: {currentCountry.label} · Currency:{" "}
              {currentCountry.currency}
            </p>

            <div style={styles.grid}>
              {COIN_PACKAGES
                .filter(pkg => isNigeria || pkg.coins >= 1000)
                .map(pkg => {
                  const selected =
                    selectedPackage.id === pkg.id;

                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectPackage(pkg)}
                      style={{
                        ...styles.package,
                        border: selected
                          ? "2px solid #22c55e"
                          : "2px solid var(--app-border, #263951)"
                      }}
                    >
                      <div style={{ fontSize: 29 }}>
                        🪙
                      </div>

                      <strong>
                        {pkg.coins.toLocaleString()} coins
                      </strong>

                      <div
                        style={{
                          fontSize: 21,
                          fontWeight: "bold",
                          marginTop: 10,
                          color: "#22c55e"
                        }}
                      >
                        {formatPrice(
                          pkg.prices[currentCountry.currency],
                          currentCountry.currency
                        )}
                      </div>

                      <p style={styles.muted}>
                        {selected ? "✓ Selected" : "Tap to select"}
                      </p>
                    </button>
                  );
                })}
            </div>

            <div
              style={{
                ...styles.card,
                background: "var(--app-secondary, #12243a)"
              }}
            >
              <p style={styles.muted}>Your selection</p>

              <h2 style={{ color: "#22c55e" }}>
                🪙 {selectedPackage.coins.toLocaleString()} coins
              </h2>

              <h3>
                {formatPrice(
                  amount,
                  currentCountry.currency
                )}
              </h3>
            </div>

            <button
              type="button"
              style={styles.button}
              onClick={continueFromPackage}
            >
              Next: Payment Method →
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={previousStep}
            >
              ← Previous: Country
            </button>
          </section>
        )}

        {/* =================================
            STEP 3: PAYMENT METHOD
        ================================= */}

        {step === 3 && (
          <section style={styles.card}>
            <h2>💳 Step 3: Select payment method</h2>

            <div
              style={{
                ...styles.card,
                marginTop: 8,
                background: "var(--app-secondary, #12243a)"
              }}
            >
              <p style={styles.muted}>Purchase summary</p>

              <h3>
                🪙 {selectedPackage.coins.toLocaleString()} coins
              </h3>

              <h2 style={{ color: "#22c55e" }}>
                {formatPrice(
                  amount,
                  currentCountry.currency
                )}
              </h2>

              <p style={styles.muted}>
                Country: {currentCountry.label}
              </p>
            </div>

            <label style={styles.paymentOption}>
              <input
                type="radio"
                name="paymentMethod"
                value="card"
                checked={paymentMethod === "card"}
                onChange={() => {
                  setPaymentMethod("card");
                  clearMessage();
                }}
              />

              <span>
                <strong>💳 Card / Flutterwave</strong>

                <span
                  style={{
                    display: "block",
                    ...styles.muted
                  }}
                >
                  Pay through the configured Flutterwave payment page.
                </span>
              </span>
            </label>

            <label style={styles.paymentOption}>
              <input
                type="radio"
                name="paymentMethod"
                value="trx"
                checked={paymentMethod === "trx"}
                onChange={() => {
                  setPaymentMethod("trx");
                  clearMessage();
                }}
              />

              <span>
                <strong>₮ TRX / TRON network</strong>

                <span
                  style={{
                    display: "block",
                    ...styles.muted
                  }}
                >
                  Pay with TRX using the verified receiving address.
                </span>
              </span>
            </label>

            {paymentMethod === "card" && (
              <div style={{ marginTop: 18 }}>
                <h3>Card payment</h3>

                {currentCountry.url ? (
                  <p style={styles.muted}>
                    The configured payment link will open when
                    you reach the next step.
                  </p>
                ) : (
                  <p
                    style={{
                      ...styles.muted,
                      color: "#f59e0b"
                    }}
                  >
                    Card payment has not been configured for{" "}
                    {currentCountry.label}. You can choose TRX
                    if the receiving address is configured.
                  </p>
                )}
              </div>
            )}

            {paymentMethod === "trx" && (
              <div style={{ marginTop: 18 }}>
                <h3>₮ TRX payment</h3>

                <p style={styles.muted}>
                  Only send TRX using the TRON network.
                  Sending another asset or using another network
                  can result in permanent loss of funds.
                </p>

                {trxAddress ? (
                  <>
                    <label htmlFor="trxAddress">
                      Official receiving address
                    </label>

                    <input
                      id="trxAddress"
                      style={styles.input}
                      value={trxAddress}
                      readOnly
                    />

                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={copyTrxAddress}
                    >
                      📋 Copy TRX Address
                    </button>
                  </>
                ) : (
                  <p
                    style={{
                      ...styles.muted,
                      color: "#f59e0b"
                    }}
                  >
                    The receiving address has not been configured.
                    Add the public address to the app_settings
                    collection before using TRX payments.
                  </p>
                )}

                <p style={styles.muted}>
                  Confirm the required TRX amount using a reliable
                  current exchange rate before sending. This page
                  does not calculate a live TRX conversion.
                </p>
              </div>
            )}

            <button
              type="button"
              style={{
                ...styles.button,
                opacity:
                  (paymentMethod === "card" && !currentCountry.url) ||
                  (paymentMethod === "trx" && !trxAddress)
                    ? 0.6
                    : 1
              }}
              disabled={
                (paymentMethod === "card" && !currentCountry.url) ||
                (paymentMethod === "trx" && !trxAddress)
              }
              onClick={continueFromPaymentMethod}
            >
              Next: Complete Payment →
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={previousStep}
            >
              ← Previous: Coin Amount
            </button>
          </section>
        )}

        {/* =================================
            STEP 4: COMPLETE PAYMENT
        ================================= */}

        {step === 4 && (
          <section style={styles.card}>
            <h2>✅ Step 4: Complete your purchase</h2>

            <div
              style={{
                ...styles.card,
                marginTop: 8,
                background: "var(--app-secondary, #12243a)"
              }}
            >
              <p style={styles.muted}>Order summary</p>

              <h3>
                🪙 {selectedPackage.coins.toLocaleString()} coins
              </h3>

              <h2 style={{ color: "#22c55e" }}>
                {formatPrice(
                  amount,
                  currentCountry.currency
                )}
              </h2>

              <p style={styles.muted}>
                Country: {currentCountry.label}
              </p>

              <p style={styles.muted}>
                Payment method:{" "}
                {paymentMethod === "trx"
                  ? "TRX / TRON"
                  : "Card / Flutterwave"}
              </p>
            </div>

            {paymentMethod === "card" && (
              <div style={{ marginTop: 18 }}>
                <h3>1. Make your payment</h3>

                <p style={styles.muted}>
                  Open the payment page, complete your payment,
                  and return to this page to enter the reference.
                </p>

                <button
                  type="button"
                  style={styles.button}
                  onClick={openPaymentPage}
                >
                  Open Flutterwave Payment ↗
                </button>
              </div>
            )}

            {paymentMethod === "trx" && (
              <div style={{ marginTop: 18 }}>
                <h3>1. Send your TRX payment</h3>

                <p style={styles.muted}>
                  Send only the verified amount to the receiving
                  address displayed below. Verify the address and
                  network before confirming your transaction.
                </p>

                <label htmlFor="finalTrxAddress">
                  Receiving address
                </label>

                <input
                  id="finalTrxAddress"
                  style={styles.input}
                  value={trxAddress}
                  readOnly
                />

                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={copyTrxAddress}
                >
                  📋 Copy TRX Address
                </button>
              </div>
            )}

            <div style={{ marginTop: 22 }}>
              <h3>2. Submit your payment details</h3>

              <label htmlFor="paymentReference">
                {paymentMethod === "trx"
                  ? "TRON transaction ID"
                  : "Payment reference"}
              </label>

              <input
                id="paymentReference"
                style={styles.input}
                value={paymentReference}
                onChange={event =>
                  setPaymentReference(event.target.value)
                }
                placeholder={
                  paymentMethod === "trx"
                    ? "Paste your TRON transaction ID"
                    : "Enter your payment reference"
                }
                autoComplete="off"
              />

              <label htmlFor="paymentNote">
                Additional note (optional)
              </label>

              <textarea
                id="paymentNote"
                style={{
                  ...styles.input,
                  resize: "vertical"
                }}
                rows={3}
                value={paymentNote}
                onChange={event =>
                  setPaymentNote(event.target.value)
                }
                placeholder="Add optional payment information"
              />

              <button
                type="button"
                style={{
                  ...styles.button,
                  opacity: submitting ? 0.6 : 1
                }}
                disabled={submitting}
                onClick={submitPurchase}
              >
                {submitting
                  ? "Submitting Request..."
                  : "Submit Payment for Verification"}
              </button>

              <p style={styles.muted}>
                Your request will remain pending until an
                administrator verifies the payment. Entering a
                reference does not itself prove payment or credit
                coins automatically.
              </p>
            </div>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={previousStep}
              disabled={submitting}
            >
              ← Previous: Payment Method
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => navigate("/wallet")}
            >
              Return to Wallet
            </button>
          </section>
        )}

        {/* =================================
            PAYMENT SAFETY
        ================================= */}

        <section style={styles.card}>
          <h3>🔐 Payment safety</h3>

          <p style={styles.muted}>
            Win9ja Life will never ask for your wallet seed phrase
            or private key. Never share them with anyone.
          </p>

          <p style={styles.muted}>
            Coin purchases are separate from your legacy game-fund
            balance. Your coins should only be credited after the
            payment has been independently verified.
          </p>
        </section>
      </div>
    </main>
  );
}