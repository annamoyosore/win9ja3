import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  DEPOSIT_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

// ==========================================
// TRX PAYMENT CONFIGURATION
// ==========================================

const TRX_RECEIVING_ADDRESS =
  "TWpZiDpjejjyUaxDUwnSGbw1dH1JQvzaAy";

// ==========================================
// PAYMENT CONFIGURATION
// ==========================================

const PAYMENT_CONFIG = {
  NG: {
    name: "Nigeria",
    currency: "NGN",
    flutterwave: "https://flutterwave.com/pay/qiattof2hy2w"
  },
  US: {
    name: "United States",
    currency: "USD",
    flutterwave: "https://flutterwave.com/pay/qiattof2hy2w"
  },
  GB: {
    name: "United Kingdom",
    currency: "GBP",
    flutterwave: ""
  },
  GH: {
    name: "Ghana",
    currency: "GHS",
    flutterwave: ""
  },
  KE: {
    name: "Kenya",
    currency: "KES",
    flutterwave: ""
  },
  ZA: {
    name: "South Africa",
    currency: "ZAR",
    flutterwave: ""
  },
  CA: {
    name: "Canada",
    currency: "CAD",
    flutterwave: ""
  }
};

// ==========================================
// COIN PACKAGES
// ==========================================

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
      CAD: 0.7
    },
    label: "Starter",
    icon: "🪙"
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
      CAD: 1.4
    },
    label: "Popular",
    icon: "💰"
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
      CAD: 3.5
    },
    label: "Value Pack",
    icon: "🏆"
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
      CAD: 7
    },
    label: "Premium",
    icon: "👑"
  }
];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(
      currency === "NGN" ? "en-NG" : "en",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 2
      }
    ).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function CoinsStore() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [country, setCountry] = useState("NG");
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("flutterwave");

  const [trxAddress, setTrxAddress] = useState(
    TRX_RECEIVING_ADDRESS
  );

  const [trxLoading, setTrxLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [notice, setNotice] = useState({
    type: "",
    message: ""
  });

  const config = PAYMENT_CONFIG[country] || PAYMENT_CONFIG.NG;

  // ==========================================
  // NOTIFICATIONS
  // ==========================================

  function notify(message, type = "info") {
    setNotice({ message, type });

    if (type === "error") {
      try {
        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;

        if (AudioContextClass) {
          const audio = new AudioContextClass();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();

          oscillator.connect(gain);
          gain.connect(audio.destination);

          oscillator.frequency.value = 620;
          gain.gain.value = 0.08;

          oscillator.start();

          setTimeout(() => {
            oscillator.stop();
            audio.close();
          }, 180);
        }
      } catch {
        // Text notification remains available.
      }
    }
  }

  useEffect(() => {
    if (!notice.message) return;

    const timer = setTimeout(() => {
      setNotice({ type: "", message: "" });
    }, 5000);

    return () => clearTimeout(timer);
  }, [notice]);

  // ==========================================
  // LOAD USER AND WALLET
  // ==========================================

  useEffect(() => {
    let cancelled = false;

    async function loadUserAndWallet() {
      try {
        const currentUser = await account.get();

        if (cancelled) return;

        setUser(currentUser);

        const response = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal("userId", currentUser.$id),
            Query.limit(1)
          ]
        );

        if (cancelled) return;

        if (response.documents.length > 0) {
          const userWallet = response.documents[0];

          setWallet(userWallet);

          const savedCountry = userWallet.country;

          if (
            savedCountry &&
            PAYMENT_CONFIG[savedCountry]
          ) {
            setCountry(savedCountry);
          }
        } else {
          setWallet(null);

          notify(
            "Your wallet was not found. Please contact support.",
            "error"
          );
        }
      } catch (error) {
        console.error("Failed to load wallet:", error);

        if (!cancelled) {
          notify(
            "Unable to load your account or wallet. Please sign in again.",
            "error"
          );
        }
      }
    }

    loadUserAndWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  // ==========================================
  // LOAD TRX ADDRESS DIRECTLY FROM THIS FILE
  // ==========================================

  useEffect(() => {
    if (paymentMethod !== "trx") return;

    const address = TRX_RECEIVING_ADDRESS.trim();

    setTrxAddress(address);
    setCopySuccess(false);
    setTrxLoading(false);

    if (!address) {
      notify(
        "The TRX receiving address is missing.",
        "error"
      );
    }
  }, [paymentMethod]);

  // ==========================================
  // COPY TRX ADDRESS
  // ==========================================

  async function copyTrxAddress() {
    if (!trxAddress) {
      notify("No TRX receiving address is available.", "error");
      return;
    }

    try {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(trxAddress);
      } else {
        const textarea = document.createElement("textarea");

        textarea.value = trxAddress;
        textarea.readOnly = true;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";

        document.body.appendChild(textarea);
        textarea.select();

        const copied = document.execCommand("copy");

        document.body.removeChild(textarea);

        if (!copied) {
          throw new Error("Clipboard copy failed.");
        }
      }

      setCopySuccess(true);

      notify(
        "TRX address copied successfully.",
        "success"
      );

      setTimeout(() => {
        setCopySuccess(false);
      }, 2500);
    } catch (error) {
      console.error("Copy address failed:", error);

      notify(
        "Copy failed. Press and hold the address to copy it manually.",
        "error"
      );
    }
  }

  // ==========================================
  // SELECT COIN PACKAGE
  // ==========================================

  function choosePackage(pack) {
    if (country !== "NG" && pack.coins < 1000) {
      notify(
        "International purchases start at 1,000 coins.",
        "error"
      );
      return;
    }

    setSelectedPackage(pack);
    setPaymentReference("");
    setPaymentNote("");
    setStep(2);
  }

  // ==========================================
  // PAYMENT METHOD
  // ==========================================

  function selectPaymentMethod(method) {
    setPaymentMethod(method);
    setPaymentReference("");
    setPaymentNote("");
  }

  function continueToPayment() {
    if (!selectedPackage) {
      notify("Please select a coin package first.", "error");
      return;
    }

    if (
      paymentMethod === "flutterwave" &&
      !config.flutterwave
    ) {
      notify(
        "Flutterwave is not configured for this country.",
        "error"
      );
      return;
    }

    if (
      paymentMethod === "trx" &&
      !trxAddress
    ) {
      notify(
        "The TRX receiving address is not available.",
        "error"
      );
      return;
    }

    setStep(3);
  }

  // ==========================================
  // SUBMIT PAYMENT REQUEST
  // ==========================================

  async function submitPurchase(event) {
    event.preventDefault();

    if (!user) {
      notify(
        "Please sign in before purchasing coins.",
        "error"
      );
      return;
    }

    if (!selectedPackage) {
      notify("Please select a coin package.", "error");
      return;
    }

    if (!wallet) {
      notify(
        "Your wallet was not found. Please contact support.",
        "error"
      );
      return;
    }

    if (!paymentReference.trim()) {
      notify(
        paymentMethod === "trx"
          ? "Enter your TRX transaction ID."
          : "Enter your Flutterwave payment reference.",
        "error"
      );
      return;
    }

    const amount = selectedPackage.prices[config.currency];

    if (typeof amount !== "number") {
      notify(
        "The price for this package is unavailable.",
        "error"
      );
      return;
    }

    setLoading(true);

    try {
      await databases.createDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        ID.unique(),
        {
          userId: user.$id,
          userEmail: user.email || "",
          userPhone: wallet.phone || "",
          packageId: selectedPackage.id,
          coins: selectedPackage.coins,
          amount,
          currency: config.currency,
          country,
          paymentProvider: paymentMethod,
          paymentReference: paymentReference.trim(),
          paymentNote: paymentNote.trim(),
          status: "pending"
        }
      );

      notify(
        "Payment request submitted for verification.",
        "success"
      );

      setStep(4);
    } catch (error) {
      console.error("Payment submission failed:", error);

      notify(
        error?.message ||
          "Unable to submit your payment request. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // STYLING
  // ==========================================

  const styles = `
    .w9-store {
      min-height: 100vh;
      background:
        radial-gradient(circle at top right, #dcfce7 0, transparent 35%),
        linear-gradient(180deg, #f8fafc, #eef2f7);
      padding: 20px 14px 40px;
      color: #172033;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
    }

    .w9-store *,
    .w9-store *::before,
    .w9-store *::after {
      box-sizing: border-box;
    }

    .w9-container {
      max-width: 980px;
      margin: 0 auto;
    }

    .w9-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 22px;
    }

    .w9-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -.5px;
    }

    .w9-brand-icon {
      display: grid;
      place-items: center;
      width: 43px;
      height: 43px;
      border-radius: 14px;
      background: linear-gradient(135deg, #16a34a, #065f46);
      color: white;
      box-shadow: 0 8px 20px #16a34a33;
      font-size: 23px;
    }

    .w9-back {
      border: 1px solid #dbe2ea;
      background: white;
      border-radius: 12px;
      padding: 10px 14px;
      color: #334155;
      font-weight: 700;
      cursor: pointer;
    }

    .w9-hero {
      position: relative;
      overflow: hidden;
      border-radius: 26px;
      padding: 27px 23px;
      color: white;
      background: linear-gradient(125deg, #064e3b, #047857 55%, #16a34a);
      box-shadow: 0 18px 40px #065f4625;
      margin-bottom: 24px;
    }

    .w9-hero::after {
      content: "🪙";
      position: absolute;
      right: 18px;
      bottom: -30px;
      font-size: 115px;
      opacity: .16;
      transform: rotate(-18deg);
      pointer-events: none;
    }

    .w9-eyebrow {
      color: #bbf7d0;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 2px;
      font-weight: 900;
    }

    .w9-hero h1 {
      font-size: clamp(26px, 5vw, 38px);
      line-height: 1.15;
      margin: 9px 0;
      font-weight: 900;
    }

    .w9-hero p {
      max-width: 540px;
      color: #dcfce7;
      line-height: 1.6;
      font-size: 14px;
      margin: 0;
    }

    .w9-balance {
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-top: 21px;
      padding: 12px 16px;
      border: 1px solid #ffffff35;
      background: #ffffff16;
      border-radius: 16px;
      backdrop-filter: blur(8px);
    }

    .w9-balance small {
      display: block;
      font-size: 11px;
      color: #d1fae5;
      margin-bottom: 3px;
    }

    .w9-balance strong {
      font-size: 21px;
    }

    .w9-panel {
      background: white;
      border: 1px solid #e5eaf0;
      border-radius: 23px;
      padding: 22px;
      margin-bottom: 20px;
      box-shadow: 0 8px 25px #0f172a08;
    }

    .w9-section-title {
      font-size: 20px;
      font-weight: 900;
      margin: 0 0 7px;
    }

    .w9-subtitle {
      font-size: 13px;
      color: #64748b;
      line-height: 1.6;
      margin: 0 0 20px;
    }

    .w9-field-label {
      display: block;
      font-size: 12px;
      font-weight: 800;
      color: #475569;
      margin-bottom: 8px;
    }

    .w9-select,
    .w9-input,
    .w9-textarea {
      width: 100%;
      padding: 13px 14px;
      background: #f8fafc;
      color: #0f172a;
      border: 1px solid #dbe2ea;
      border-radius: 12px;
      outline: none;
      font: inherit;
      font-size: 14px;
    }

    .w9-select:focus,
    .w9-input:focus,
    .w9-textarea:focus {
      border-color: #16a34a;
      box-shadow: 0 0 0 3px #16a34a17;
    }

    .w9-country {
      max-width: 380px;
      margin-bottom: 23px;
    }

    .w9-packages {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 13px;
    }

    .w9-package {
      text-align: left;
      padding: 17px 14px;
      background: linear-gradient(145deg, #fffdf5, #fff);
      border: 1px solid #f1dfad;
      border-radius: 19px;
      cursor: pointer;
      transition: transform .18s, box-shadow .18s, border-color .18s;
      color: #172033;
      min-width: 0;
    }

    .w9-package:hover:not(:disabled) {
      transform: translateY(-3px);
      border-color: #eab308;
      box-shadow: 0 12px 24px #ca8a0417;
    }

    .w9-package:disabled {
      opacity: .45;
      cursor: not-allowed;
    }

    .w9-package-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 12px;
    }

    .w9-coin-art {
      display: grid;
      place-items: center;
      width: 47px;
      height: 47px;
      border-radius: 15px;
      background: linear-gradient(135deg, #fef3c7, #facc15);
      box-shadow: inset 0 0 0 1px #eab30850;
      font-size: 28px;
    }

    .w9-badge {
      background: #dcfce7;
      color: #166534;
      border-radius: 20px;
      padding: 5px 7px;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 900;
    }

    .w9-package h3 {
      font-size: 22px;
      font-weight: 950;
      margin: 0;
    }

    .w9-coin-label {
      font-size: 11px;
      color: #64748b;
      margin: 3px 0 13px;
    }

    .w9-price {
      display: block;
      color: #047857;
      font-size: 17px;
      font-weight: 900;
    }

    .w9-package-footer {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 5px;
    }

    .w9-methods {
      display: grid;
      gap: 12px;
    }

    .w9-method {
      display: flex;
      align-items: center;
      gap: 13px;
      border: 1px solid #dbe2ea;
      background: white;
      border-radius: 16px;
      padding: 15px;
      cursor: pointer;
      text-align: left;
      color: #172033;
      width: 100%;
    }

    .w9-method.active {
      border-color: #16a34a;
      background: #f0fdf4;
      box-shadow: 0 0 0 2px #16a34a12;
    }

    .w9-method-icon {
      width: 45px;
      height: 45px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      border-radius: 13px;
      background: #f1f5f9;
      font-size: 24px;
    }

    .w9-method strong {
      display: block;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .w9-method small {
      display: block;
      color: #64748b;
      font-size: 11px;
      line-height: 1.5;
    }

    .w9-method-check {
      margin-left: auto;
      color: #16a34a;
      font-size: 20px;
      font-weight: 900;
    }

    .w9-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      border: none;
      border-radius: 13px;
      padding: 14px 18px;
      font-size: 14px;
      font-weight: 900;
      cursor: pointer;
      transition: opacity .2s, transform .2s;
    }

    .w9-button:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .w9-button:disabled {
      opacity: .55;
      cursor: not-allowed;
    }

    .w9-primary {
      background: linear-gradient(135deg, #16a34a, #047857);
      color: white;
      box-shadow: 0 8px 17px #16a34a25;
    }

    .w9-secondary {
      color: #334155;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
    }

    .w9-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }

    .w9-actions > * {
      flex: 1;
    }

    .w9-address-box {
      background: #f8fafc;
      border: 1px solid #dbe2ea;
      padding: 14px;
      border-radius: 15px;
      margin: 15px 0;
    }

    .w9-address {
      display: block;
      width: 100%;
      padding: 12px;
      margin-top: 9px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: white;
      color: #0f172a;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      line-height: 1.7;
      overflow-wrap: anywhere;
      user-select: text;
      -webkit-user-select: text;
    }

    .w9-info,
    .w9-warning {
      padding: 13px 15px;
      border-radius: 12px;
      font-size: 12px;
      line-height: 1.7;
      margin: 15px 0;
    }

    .w9-info {
      background: #eff6ff;
      color: #1e40af;
    }

    .w9-warning {
      background: #fffbeb;
      color: #92400e;
    }

    .w9-notice {
      position: sticky;
      top: 10px;
      z-index: 10;
      padding: 13px 16px;
      border-radius: 13px;
      margin-bottom: 16px;
      font-size: 13px;
      line-height: 1.6;
      font-weight: 700;
      box-shadow: 0 5px 20px #0f172a12;
    }

    .w9-notice.success {
      background: #dcfce7;
      border: 1px solid #86efac;
      color: #166534;
    }

    .w9-notice.error {
      background: #fee2e2;
      border: 1px solid #fca5a5;
      color: #991b1b;
    }

    .w9-notice.info {
      background: #dbeafe;
      border: 1px solid #93c5fd;
      color: #1e40af;
    }

    .w9-steps {
      display: flex;
      gap: 7px;
      margin-bottom: 21px;
    }

    .w9-step {
      height: 5px;
      flex: 1;
      border-radius: 10px;
      background: #e2e8f0;
    }

    .w9-step.active {
      background: #16a34a;
    }

    .w9-summary {
      border: 1px solid #e2e8f0;
      border-radius: 15px;
      padding: 15px;
      margin-bottom: 18px;
    }

    .w9-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      font-size: 13px;
    }

    .w9-summary-row span:first-child {
      color: #64748b;
    }

    .w9-summary-row strong {
      text-align: right;
      overflow-wrap: anywhere;
    }

    .w9-success-icon {
      display: grid;
      place-items: center;
      width: 76px;
      height: 76px;
      margin: 0 auto 18px;
      border-radius: 50%;
      background: #dcfce7;
      color: #15803d;
      font-size: 40px;
    }

    .w9-center {
      text-align: center;
    }

    .w9-muted {
      color: #64748b;
      font-size: 13px;
      line-height: 1.7;
    }

    .w9-footer {
      text-align: center;
      font-size: 11px;
      line-height: 1.7;
      color: #94a3b8;
      padding: 8px 10px 20px;
    }

    @media (min-width: 650px) {
      .w9-store {
        padding: 30px 24px 50px;
      }

      .w9-hero {
        padding: 36px;
      }

      .w9-packages {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .w9-panel {
        padding: 28px;
      }
    }

    @media (max-width: 370px) {
      .w9-package {
        padding: 13px 10px;
      }

      .w9-package h3 {
        font-size: 19px;
      }

      .w9-price {
        font-size: 15px;
      }

      .w9-hero {
        padding: 22px 17px;
      }

      .w9-actions {
        flex-direction: column;
      }
    }
  `;

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="w9-store">
      <style>{styles}</style>

      <div className="w9-container">
        {notice.message && (
          <div
            className={`w9-notice ${notice.type}`}
            role="status"
            aria-live="polite"
          >
            {notice.type === "success"
              ? "✓ "
              : notice.type === "error"
                ? "⚠ "
                : "ℹ "}
            {notice.message}
          </div>
        )}

        <header className="w9-header">
          <div className="w9-brand">
            <div className="w9-brand-icon">W</div>
            <span>Win9ja Life</span>
          </div>

          <button
            className="w9-back"
            type="button"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
        </header>

        {/* HERO AND WALLET BALANCE */}

        <section className="w9-hero">
          <div className="w9-eyebrow">
            Win9ja Life Store
          </div>

          <h1>Power up with W Coins</h1>

          <p>
            Get more coins for your Win9ja Life experience.
            Choose a package and follow the payment steps.
          </p>

          <div className="w9-balance">
            <span style={{ fontSize: 30 }}>🪙</span>

            <div>
              <small>Your W Coin balance</small>

              <strong>
                {Number(wallet?.coins ?? 0).toLocaleString()} W Coins
              </strong>
            </div>
          </div>
        </section>

        <div
          className="w9-steps"
          aria-label={`Step ${step} of 4`}
        >
          {[1, 2, 3, 4].map((number) => (
            <div
              key={number}
              className={`w9-step ${
                step >= number ? "active" : ""
              }`}
            />
          ))}
        </div>

        {/* ======================================
            STEP 1: SELECT PACKAGE
        ====================================== */}

        {step === 1 && (
          <section className="w9-panel">
            <h2 className="w9-section-title">
              Choose your coin package
            </h2>

            <p className="w9-subtitle">
              Select your country to see available package prices.
            </p>

            <div className="w9-country">
              <label
                className="w9-field-label"
                htmlFor="w9-country"
              >
                Country / Currency
              </label>

              <select
                id="w9-country"
                className="w9-select"
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setSelectedPackage(null);
                }}
              >
                {Object.entries(PAYMENT_CONFIG).map(
                  ([code, item]) => (
                    <option key={code} value={code}>
                      {item.name} ({item.currency})
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="w9-packages">
              {COIN_PACKAGES.map((pack) => {
                const restricted =
                  country !== "NG" && pack.coins < 1000;

                return (
                  <button
                    key={pack.id}
                    type="button"
                    className="w9-package"
                    disabled={restricted}
                    onClick={() => choosePackage(pack)}
                  >
                    <div className="w9-package-top">
                      <div className="w9-coin-art">
                        {pack.icon}
                      </div>

                      {pack.coins === 1000 && (
                        <span className="w9-badge">
                          Popular
                        </span>
                      )}
                    </div>

                    <h3>
                      {pack.coins.toLocaleString()}
                    </h3>

                    <p className="w9-coin-label">
                      W Coins · {pack.label}
                    </p>

                    <strong className="w9-price">
                      {formatMoney(
                        pack.prices[config.currency],
                        config.currency
                      )}
                    </strong>

                    <div className="w9-package-footer">
                      {restricted
                        ? "Unavailable internationally"
                        : "Tap to select →"}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="w9-info">
              Coin purchases remain pending until payment is
              verified. Only send funds to a receiving address
              you have confirmed belongs to Win9ja Life.
            </div>
          </section>
        )}

        {/* ======================================
            STEP 2: PAYMENT METHOD
        ====================================== */}

        {step === 2 && selectedPackage && (
          <section className="w9-panel">
            <h2 className="w9-section-title">
              Choose payment method
            </h2>

            <p className="w9-subtitle">
              Select how you want to pay for your coins.
            </p>

            <div className="w9-summary">
              <div className="w9-summary-row">
                <span>Package</span>
                <strong>
                  {selectedPackage.coins.toLocaleString()} W Coins
                </strong>
              </div>

              <div className="w9-summary-row">
                <span>Amount</span>
                <strong>
                  {formatMoney(
                    selectedPackage.prices[config.currency],
                    config.currency
                  )}
                </strong>
              </div>

              <div className="w9-summary-row">
                <span>Country</span>
                <strong>{config.name}</strong>
              </div>
            </div>

            <div className="w9-methods">
              <button
                type="button"
                className={`w9-method ${
                  paymentMethod === "flutterwave" ? "active" : ""
                }`}
                onClick={() =>
                  selectPaymentMethod("flutterwave")
                }
              >
                <div className="w9-method-icon">💳</div>

                <div>
                  <strong>Flutterwave</strong>
                  <small>
                    Pay through the configured checkout page.
                  </small>
                </div>

                {paymentMethod === "flutterwave" && (
                  <span className="w9-method-check">✓</span>
                )}
              </button>

              <button
                type="button"
                className={`w9-method ${
                  paymentMethod === "trx" ? "active" : ""
                }`}
                onClick={() => selectPaymentMethod("trx")}
              >
                <div className="w9-method-icon">₮</div>

                <div>
                  <strong>TRX / Tron network</strong>
                  <small>
                    Send crypto to the displayed receiving address.
                  </small>
                </div>

                {paymentMethod === "trx" && (
                  <span className="w9-method-check">✓</span>
                )}
              </button>
            </div>

            <div className="w9-actions">
              <button
                className="w9-button w9-secondary"
                type="button"
                onClick={() => setStep(1)}
              >
                Back
              </button>

              <button
                className="w9-button w9-primary"
                type="button"
                onClick={continueToPayment}
                disabled={
                  paymentMethod === "trx" &&
                  (trxLoading || !trxAddress)
                }
              >
                {paymentMethod === "trx" && trxLoading
                  ? "Loading address..."
                  : "Continue →"}
              </button>
            </div>
          </section>
        )}

        {/* ======================================
            STEP 3: PAYMENT
        ====================================== */}

        {step === 3 && selectedPackage && (
          <section className="w9-panel">
            <h2 className="w9-section-title">
              Complete your payment
            </h2>

            <p className="w9-subtitle">
              Follow the instructions and submit your transaction
              reference for verification.
            </p>

            <div className="w9-summary">
              <div className="w9-summary-row">
                <span>Coins</span>
                <strong>
                  {selectedPackage.coins.toLocaleString()} W Coins
                </strong>
              </div>

              <div className="w9-summary-row">
                <span>Payment amount</span>
                <strong>
                  {formatMoney(
                    selectedPackage.prices[config.currency],
                    config.currency
                  )}
                </strong>
              </div>

              <div className="w9-summary-row">
                <span>Payment method</span>
                <strong>
                  {paymentMethod === "trx"
                    ? "TRX / Tron"
                    : "Flutterwave"}
                </strong>
              </div>
            </div>

            {paymentMethod === "trx" ? (
              <>
                <div className="w9-address-box">
                  <label className="w9-field-label">
                    TRX receiving address
                  </label>

                  {trxLoading ? (
                    <p className="w9-muted">
                      Loading receiving address...
                    </p>
                  ) : trxAddress ? (
                    <>
                      <input
                        className="w9-address"
                        type="text"
                        value={trxAddress}
                        readOnly
                        aria-label="TRX receiving address"
                        onFocus={(event) =>
                          event.target.select()
                        }
                      />

                      <button
                        type="button"
                        className="w9-button w9-primary"
                        style={{ marginTop: 10 }}
                        onClick={copyTrxAddress}
                      >
                        {copySuccess
                          ? "✓ Address Copied"
                          : "📋 Copy TRX Address"}
                      </button>
                    </>
                  ) : (
                    <div className="w9-warning">
                      The TRX address is unavailable. Do not send
                      funds until the correct address is displayed.
                    </div>
                  )}
                </div>

                <div className="w9-warning">
                  <strong>Important:</strong> Confirm the receiving
                  address and network before sending funds.
                  Cryptocurrency transfers may be irreversible.
                </div>
              </>
            ) : (
              <>
                <div className="w9-info">
                  Open the configured Flutterwave checkout. Confirm
                  the amount and currency before paying.
                </div>

                <button
                  type="button"
                  className="w9-button w9-primary"
                  onClick={() => {
                    if (!config.flutterwave) {
                      notify(
                        "Flutterwave is not configured for this country.",
                        "error"
                      );
                      return;
                    }

                    window.open(
                      config.flutterwave,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                >
                  💳 Open Flutterwave Checkout ↗
                </button>

                <p className="w9-muted">
                  After paying, return here and enter your payment
                  reference.
                </p>
              </>
            )}

            <form onSubmit={submitPurchase}>
              <div style={{ marginTop: 22 }}>
                <label
                  className="w9-field-label"
                  htmlFor="w9-reference"
                >
                  {paymentMethod === "trx"
                    ? "TRX transaction ID"
                    : "Flutterwave payment reference"}
                </label>

                <input
                  id="w9-reference"
                  className="w9-input"
                  type="text"
                  value={paymentReference}
                  onChange={(event) =>
                    setPaymentReference(event.target.value)
                  }
                  placeholder={
                    paymentMethod === "trx"
                      ? "Enter your blockchain transaction ID"
                      : "Enter your payment reference"
                  }
                  required
                  autoComplete="off"
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <label
                  className="w9-field-label"
                  htmlFor="w9-note"
                >
                  Additional note (optional)
                </label>

                <textarea
                  id="w9-note"
                  className="w9-textarea"
                  rows={3}
                  value={paymentNote}
                  onChange={(event) =>
                    setPaymentNote(event.target.value)
                  }
                  placeholder="Add relevant payment details"
                />
              </div>

              <div className="w9-info">
                Submitting this form records your payment claim.
                It does not automatically verify payment or credit
                coins to your wallet.
              </div>

              <div className="w9-actions">
                <button
                  className="w9-button w9-secondary"
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={loading}
                >
                  Back
                </button>

                <button
                  className="w9-button w9-primary"
                  type="submit"
                  disabled={
                    loading ||
                    (paymentMethod === "trx" && !trxAddress)
                  }
                >
                  {loading ? "Submitting..." : "Submit Payment"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ======================================
            STEP 4: CONFIRMATION
        ====================================== */}

        {step === 4 && (
          <section className="w9-panel">
            <div className="w9-center">
              <div className="w9-success-icon">✓</div>

              <h2 className="w9-section-title">
                Payment request submitted
              </h2>

              <p className="w9-muted">
                Your payment details have been submitted for
                verification. Your coins will remain uncredited
                until payment is confirmed.
              </p>
            </div>

            <div className="w9-summary">
              <div className="w9-summary-row">
                <span>Package</span>
                <strong>
                  {selectedPackage?.coins.toLocaleString()} W Coins
                </strong>
              </div>

              <div className="w9-summary-row">
                <span>Amount</span>
                <strong>
                  {selectedPackage
                    ? formatMoney(
                        selectedPackage.prices[config.currency],
                        config.currency
                      )
                    : ""}
                </strong>
              </div>

              <div className="w9-summary-row">
                <span>Payment method</span>
                <strong>
                  {paymentMethod === "trx"
                    ? "TRX / Tron"
                    : "Flutterwave"}
                </strong>
              </div>

              <div className="w9-summary-row">
                <span>Status</span>
                <strong style={{ color: "#b45309" }}>
                  Pending verification
                </strong>
              </div>
            </div>

            <div className="w9-info">
              Keep your payment reference. If payment is confirmed
              but your coins are not credited, contact Win9ja Life
              support.
            </div>

            <button
              type="button"
              className="w9-button w9-primary"
              onClick={() => navigate("/")}
            >
              Return to Win9ja Life
            </button>

            <button
              type="button"
              className="w9-button w9-secondary"
              style={{ marginTop: 10 }}
              onClick={() => {
                setSelectedPackage(null);
                setPaymentReference("");
                setPaymentNote("");
                setPaymentMethod("flutterwave");
                setStep(1);
              }}
            >
              Buy Another Package
            </button>
          </section>
        )}

        <footer className="w9-footer">
          Win9ja Life · W Coins Store
          <br />
          Always confirm payment details before transferring funds.
        </footer>
      </div>
    </div>
  );
}