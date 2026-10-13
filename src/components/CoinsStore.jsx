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
// Existing prices are preserved.
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
// STYLES
// =====================================

const styles = {
  page: {
    minHeight: "100vh",
    background: "#07111f",
    color: "#ffffff",
    padding: "20px",
    fontFamily: "Arial, sans-serif"
  },

  container: {
    maxWidth: "850px",
    margin: "0 auto"
  },

  card: {
    background: "#101e31",
    border: "1px solid #263951",
    borderRadius: "15px",
    padding: "18px",
    marginTop: "16px"
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: "12px",
    marginTop: "16px"
  },

  package: {
    background: "#12243a",
    color: "#ffffff",
    border: "2px solid #263951",
    borderRadius: "12px",
    padding: "16px",
    cursor: "pointer",
    textAlign: "left"
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    marginTop: "8px",
    marginBottom: "12px",
    background: "#07111f",
    color: "#ffffff",
    border: "1px solid #344861",
    borderRadius: "8px"
  },

  button: {
    width: "100%",
    padding: "13px",
    marginTop: "10px",
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    borderRadius: "9px",
    fontWeight: "bold",
    cursor: "pointer"
  },

  secondaryButton: {
    width: "100%",
    padding: "12px",
    marginTop: "10px",
    background: "#263951",
    color: "#ffffff",
    border: "none",
    borderRadius: "9px",
    cursor: "pointer"
  },

  muted: {
    color: "#a6b7cc",
    fontSize: "13px",
    lineHeight: 1.6
  },

  message: {
    padding: "12px",
    borderRadius: "8px",
    background: "#142b40",
    marginTop: "12px",
    overflowWrap: "anywhere"
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

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [message, setMessage] = useState("");

  const [messageType, setMessageType] = useState("info");

  const currentCountry = PAYMENT_CONFIG[country];

  const amount = selectedPackage?.prices?.[currentCountry.currency];

  const isNigeria = country === "NG";

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
        }
      } catch (error) {
        console.error("Unable to load user:", error);

        if (active) {
          setMessage("Please sign in to purchase coins.");
          setMessageType("error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  // =====================================
  // LOAD PUBLIC TRX RECEIVING ADDRESS
  // =====================================

  useEffect(() => {
    let active = true;

    async function loadTrxAddress() {
      if (paymentMethod !== "trx") return;

      setTrxAddress("");

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

        const setting = response.documents[0];

        setTrxAddress(setting?.settingValue || "");
      } catch (error) {
        console.error("Could not load TRX settings:", error);

        if (active) {
          setTrxAddress("");
        }
      }
    }

    loadTrxAddress();

    return () => {
      active = false;
    };
  }, [paymentMethod]);

  // =====================================
  // SELECT PACKAGE
  // =====================================

  function selectPackage(coinPackage) {
    setSelectedPackage(coinPackage);
    setMessage("");
    setPaymentReference("");
    setPaymentNote("");
  }

  // =====================================
  // OPEN CARD PAYMENT
  // =====================================

  function openPaymentPage() {
    setMessage("");

    if (!user) {
      setMessage("Please sign in before purchasing coins.");
      setMessageType("error");
      return;
    }

    if (!currentCountry.url) {
      setMessage(
        `Card payments for ${currentCountry.label} have not been configured yet.`
      );

      setMessageType("error");
      return;
    }

    if (selectedPackage.coins < 1000 && !isNigeria) {
      setMessage(
        "International purchases must be at least 1,000 coins."
      );

      setMessageType("error");
      return;
    }

    window.open(
      currentCountry.url,
      "_blank",
      "noopener,noreferrer"
    );

    setMessage(
      "Complete payment in the payment window. Return here afterward and enter your payment reference."
    );

    setMessageType("info");
  }

  // =====================================
  // COPY TRX ADDRESS
  // =====================================

  async function copyTrxAddress() {
    if (!trxAddress) {
      setMessage("The TRX receiving address is not configured yet.");
      setMessageType("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(trxAddress);

      setMessage("TRX address copied.");
      setMessageType("success");
    } catch {
      setMessage(
        "Copy was unsuccessful. Please select and copy the address manually."
      );

      setMessageType("error");
    }
  }

  // =====================================
  // SUBMIT PURCHASE REQUEST
  //
  // This does NOT credit coins.
  // Admin must verify the payment.
  // =====================================

  async function submitPurchase() {
    if (submitting) return;

    setMessage("");

    if (!user) {
      setMessage("Please sign in first.");
      setMessageType("error");
      return;
    }

    if (!selectedPackage) {
      setMessage("Please select a coin package.");
      setMessageType("error");
      return;
    }

    if (!paymentReference.trim()) {
      setMessage(
        paymentMethod === "trx"
          ? "Enter your TRON transaction ID."
          : "Enter your payment reference."
      );

      setMessageType("error");
      return;
    }

    if (paymentMethod === "trx" && !trxAddress) {
      setMessage(
        "The TRX receiving address is not configured yet. Please contact support."
      );

      setMessageType("error");
      return;
    }

    if (paymentMethod === "card" && !currentCountry.url) {
      setMessage("Card payment is unavailable for this country.");
      setMessageType("error");
      return;
    }

    if (!isNigeria && selectedPackage.coins < 1000) {
      setMessage(
        "The minimum international purchase is 1,000 coins."
      );

      setMessageType("error");
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

      setMessage(
        "Your purchase request has been submitted. Your coins will be credited after the admin verifies your payment."
      );

      setMessageType("success");

      setPaymentReference("");
      setPaymentNote("");
    } catch (error) {
      console.error("Purchase request failed:", error);

      setMessage(
        `Could not submit your request: ${
          error.message ||
          "Please check the deposit_requests collection attributes in Appwrite."
        }`
      );

      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
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

        <button
          style={styles.secondaryButton}
          onClick={() => navigate("/wallet")}
        >
          ← Back to Wallet
        </button>

        <header style={{ textAlign: "center", marginTop: 25 }}>
          <div style={{ fontSize: 48 }}>🪙</div>

          <h1>Win9ja Life Coin Store</h1>

          <p style={styles.muted}>
            Purchase coins for your Win9ja Life account.
          </p>
        </header>

        {/* STATUS MESSAGE */}

        {message && (
          <div
            role="status"
            style={{
              ...styles.message,
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

        {/* COUNTRY SELECTION */}

        <section style={styles.card}>
          <h2>🌍 Select your country</h2>

          <select
            style={styles.input}
            value={country}
            onChange={event => {
              setCountry(event.target.value);
              setMessage("");
              setPaymentReference("");
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

          <p style={styles.muted}>
            Currency: {currentCountry.currency}
          </p>
        </section>

        {/* PACKAGE SELECTION */}

        <section style={styles.card}>
          <h2>Choose your coin package</h2>

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
                    onClick={() => selectPackage(pkg)}
                    style={{
                      ...styles.package,
                      border: selected
                        ? "2px solid #22c55e"
                        : "2px solid #263951"
                    }}
                  >
                    <div style={{ fontSize: 27 }}>
                      🪙
                    </div>

                    <strong>
                      {pkg.coins.toLocaleString()} coins
                    </strong>

                    <div
                      style={{
                        fontSize: 21,
                        marginTop: 10,
                        color: "#4ade80"
                      }}
                    >
                      {formatPrice(
                        pkg.prices[currentCountry.currency],
                        currentCountry.currency
                      )}
                    </div>

                    <p style={styles.muted}>
                      {selected ? "Selected" : "Choose package"}
                    </p>
                  </button>
                );
              })}
          </div>

          <div
            style={{
              marginTop: 20,
              padding: 15,
              borderRadius: 10,
              background: "#07111f"
            }}
          >
            <p>Selected package:</p>

            <h2 style={{ color: "#4ade80" }}>
              {selectedPackage.coins.toLocaleString()} coins
            </h2>

            <h3>
              {formatPrice(
                amount,
                currentCountry.currency
              )}
            </h3>
          </div>
        </section>

        {/* PAYMENT METHOD */}

        <section style={styles.card}>
          <h2>💳 Choose payment method</h2>

          <label
            style={{
              display: "block",
              padding: 12,
              background: "#07111f",
              borderRadius: 8,
              marginTop: 10
            }}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="card"
              checked={paymentMethod === "card"}
              onChange={() => {
                setPaymentMethod("card");
                setMessage("");
              }}
            />

            {" "}Card / Flutterwave
          </label>

          <label
            style={{
              display: "block",
              padding: 12,
              background: "#07111f",
              borderRadius: 8,
              marginTop: 10
            }}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="trx"
              checked={paymentMethod === "trx"}
              onChange={() => {
                setPaymentMethod("trx");
                setMessage("");
              }}
            />

            {" "}TRX / TRON network
          </label>

          {/* CARD PAYMENT */}

          {paymentMethod === "card" && (
            <div style={{ marginTop: 18 }}>
              <h3>Pay with card</h3>

              <p style={styles.muted}>
                Open the payment page, complete payment,
                and return here to submit your payment reference.
              </p>

              <button
                style={styles.button}
                onClick={openPaymentPage}
                disabled={!currentCountry.url}
              >
                {currentCountry.url
                  ? "Open payment page"
                  : "Payment not configured"}
              </button>

              {!currentCountry.url && (
                <p style={styles.muted}>
                  A country-specific payment link must be
                  configured before card payments can be used
                  for this country.
                </p>
              )}
            </div>
          )}

          {/* TRX PAYMENT */}

          {paymentMethod === "trx" && (
            <div style={{ marginTop: 18 }}>
              <h3>₮ Pay using TRX</h3>

              <p style={styles.muted}>
                Only send TRX using the TRON network.
                Sending another asset or using another network
                may result in permanent loss of funds.
              </p>

              {trxAddress ? (
                <>
                  <label>
                    Official TRX receiving address
                  </label>

                  <input
                    style={styles.input}
                    value={trxAddress}
                    readOnly
                  />

                  <button
                    type="button"
                    style={styles.button}
                    onClick={copyTrxAddress}
                  >
                    📋 Copy TRX address
                  </button>
                </>
              ) : (
                <div
                  style={{
                    ...styles.message,
                    border: "1px solid #f59e0b"
                  }}
                >
                  <strong>
                    TRX receiving address not configured.
                  </strong>

                  <p style={styles.muted}>
                    The administrator must create the
                    app_settings collection and add the public
                    receiving address before users can submit
                    TRX purchase requests.
                  </p>
                </div>
              )}

              <p style={styles.muted}>
                Confirm the required TRX amount using the
                current exchange rate before sending. This page
                does not have a live TRX price feed, so it does
                not calculate a guaranteed TRX payment amount.
              </p>
            </div>
          )}

          {/* PAYMENT REFERENCE */}

          <label
            style={{
              display: "block",
              marginTop: 20
            }}
          >
            {paymentMethod === "trx"
              ? "TRON transaction ID"
              : "Payment reference"}
          </label>

          <input
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
          />

          <label>Additional note (optional)</label>

          <textarea
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
            style={{
              ...styles.button,
              opacity: submitting ? 0.6 : 1
            }}
            onClick={submitPurchase}
            disabled={submitting}
          >
            {submitting
              ? "Submitting request..."
              : "Submit payment for verification"}
          </button>

          <p style={styles.muted}>
            Submitting a reference does not automatically
            credit coins. The administrator must verify that
            the payment was actually received.
          </p>
        </section>

        {/* IMPORTANT NOTICE */}

        <section style={styles.card}>
          <h3>🔐 Payment safety</h3>

          <p style={styles.muted}>
            Win9ja Life will never ask for your wallet seed
            phrase or private key. Never share them with anyone.
          </p>

          <p style={styles.muted}>
            Your game balance and coin balance are separate.
            Buying coins does not directly change your game
            funds.
          </p>
        </section>

        <button
          style={styles.secondaryButton}
          onClick={() => navigate("/wallet")}
        >
          Return to Wallet
        </button>

      </div>
    </main>
  );
}