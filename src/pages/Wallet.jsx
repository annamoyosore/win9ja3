import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account, databases, DATABASE_ID } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";
import { ID, Query } from "appwrite";

const PROMO_COLLECTION = "promocodes";

const currencies = {
  NG: { name: "Nigeria", currency: "NGN", symbol: "₦" },
  US: { name: "United States", currency: "USD", symbol: "$" },
  GB: { name: "United Kingdom", currency: "GBP", symbol: "£" },
  CA: { name: "Canada", currency: "CAD", symbol: "C$" },
  GH: { name: "Ghana", currency: "GHS", symbol: "GH₵" },
  KE: { name: "Kenya", currency: "KES", symbol: "KSh" },
  ZA: { name: "South Africa", currency: "ZAR", symbol: "R" },
  IN: { name: "India", currency: "INR", symbol: "₹" }
};

// Display examples only; these are not purchasable packages.
const coinPackages = [
  { coins: 500, usd: 0.5 },
  { coins: 1000, usd: 1 },
  { coins: 2500, usd: 2.5 },
  { coins: 5000, usd: 5 }
];

export default function Wallet() {
  const navigate = useNavigate();

  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  const [promo, setPromo] = useState(null);
  const [zangiContact, setZangiContact] = useState("");

  const [showDeposit, setShowDeposit] = useState(false);
  const [country, setCountry] = useState(() => {
    try {
      return localStorage.getItem("win9ja_country") || "NG";
    } catch {
      return "NG";
    }
  });

  const [exchangeRate, setExchangeRate] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  // Load wallet and promo information.
  async function load() {
    try {
      const user = await account.get();
      const w = await getWallet(user.$id);

      setWallet(w);
      setZangiContact(w?.zangiContact || "");

      const res = await databases.listDocuments(
        DATABASE_ID,
        PROMO_COLLECTION,
        [Query.equal("ownerId", user.$id)]
      );

      if (res.documents.length > 0) {
        setPromo(res.documents[0]);
      }
    } catch (err) {
      console.error("Wallet loading error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Load an estimated exchange rate.
  useEffect(() => {
    let cancelled = false;

    async function loadRate() {
      setRateLoading(true);
      setExchangeRate(null);

      try {
        const currency = currencies[country]?.currency || "NGN";

        const response = await fetch(
          "https://open.er-api.com/v6/latest/USD"
        );

        if (!response.ok) {
          throw new Error("Exchange rate request failed.");
        }

        const data = await response.json();

        if (data.result !== "success") {
          throw new Error("Exchange rate unavailable.");
        }

        const rate =
          currency === "USD" ? 1 : data.rates?.[currency];

        if (typeof rate !== "number" || !Number.isFinite(rate)) {
          throw new Error("No rate available for this currency.");
        }

        if (!cancelled) {
          setExchangeRate(rate);
        }
      } catch (err) {
        console.error("Exchange rate error:", err);
      } finally {
        if (!cancelled) {
          setRateLoading(false);
        }
      }
    }

    loadRate();

    return () => {
      cancelled = true;
    };
  }, [country]);

  function selectCountry(code) {
    setCountry(code);
    setExchangeRate(null);

    try {
      localStorage.setItem("win9ja_country", code);
    } catch (err) {
      console.warn("Could not save country preference.");
    }
  }

  function formatLocalPrice(usd) {
    if (exchangeRate === null) {
      return "Rate unavailable";
    }

    const currency = currencies[country]?.currency || "NGN";

    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(usd * exchangeRate);
  }

  // Promo code functions.
  function generateCode(name) {
    const base = (name || wallet?.name || "USER")
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
      alert("Promo created!");
    } catch (err) {
      alert(err.message);
    }
  }

  async function copyCode() {
    if (!promo?.code) return;

    try {
      await navigator.clipboard.writeText(promo.code);
      alert("Promo code copied!");
    } catch {
      alert("Unable to copy promo code.");
    }
  }

  async function copyInvite() {
    if (!promo?.code) {
      return alert("Generate a promo code first.");
    }

    const text = `
🎮 Join Win9ja Life
Use Promo Code: ${promo.code}

https://win9jalife.vercel.app

📲 Join Community Group:
https://chat.whatsapp.com/XXXXXXXX
    `.trim();

    try {
      await navigator.clipboard.writeText(text);
      alert("Invite copied!");
    } catch {
      alert("Unable to copy invite.");
    }
  }

  // Save Zangi contact.
  async function saveZangi() {
    try {
      if (!wallet?.$id) {
        return alert("Wallet not found.");
      }

      await databases.updateDocument(
        DATABASE_ID,
        "wallets",
        wallet.$id,
        { zangiContact }
      );

      alert("Zangi saved!");
    } catch (err) {
      alert(err.message);
    }
  }

  // Demo deposit interface: no payment or coin credit occurs.
  function makeDeposit() {
    alert(
      "This is a deposit UI preview. Payments and coin credits are not enabled."
    );
  }

  // Existing withdrawal form retained as a disabled prototype.
  function requestWithdraw() {
    if (withdrawLoading) return;

    alert(
      "Withdrawals are not enabled in this UI prototype."
    );
  }

  if (loading) {
    return (
      <div className="wallet-page">
        <h2>💳 Wallet</h2>
        <p>Loading wallet...</p>
      </div>
    );
  }

  return (
    <div className="wallet-page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .wallet-page {
          min-height: 100vh;
          padding: 20px;
          background:
            radial-gradient(ellipse at top, #172554 0%, #0f172a 55%);
          color: #f8fafc;
          font-family: Arial, sans-serif;
        }

        .wallet-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .wallet-card {
          background: rgba(17, 24, 39, 0.96);
          border: 1px solid #334155;
          padding: 18px;
          border-radius: 16px;
          margin-top: 14px;
        }

        .wallet-button {
          width: 100%;
          padding: 13px;
          margin-top: 10px;
          background: linear-gradient(135deg, #fde68a, #eab308);
          color: #422006;
          font-weight: 800;
          border: none;
          border-radius: 10px;
          cursor: pointer;
        }

        .wallet-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .wallet-input {
          display: block;
          width: 100%;
          padding: 12px;
          margin-top: 10px;
          background: #0f172a;
          color: white;
          border: 1px solid #475569;
          border-radius: 9px;
          outline-color: #eab308;
        }

        .wallet-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          padding: 16px;
          background: rgba(2, 6, 23, 0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow-y: auto;
        }

        .wallet-modal-content {
          width: 100%;
          max-width: 460px;
          max-height: 92vh;
          overflow-y: auto;
          padding: 22px;
          background: #111827;
          color: white;
          border: 1px solid #475569;
          border-radius: 20px;
          box-shadow: 0 20px 70px #0009;
        }

        .coin-hero {
          position: relative;
          overflow: hidden;
          padding: 20px 12px 16px;
          border-radius: 15px;
          text-align: center;
          background:
            radial-gradient(circle at 50% 30%, #334155, #0f172a 75%);
          border: 1px solid #475569;
        }

        .coin-stack {
          position: relative;
          width: 118px;
          height: 100px;
          margin: 4px auto 12px;
        }

        .gold-coin {
          position: absolute;
          width: 66px;
          height: 66px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 29px;
          font-weight: 900;
          color: #854d0e;
          background:
            radial-gradient(circle at 30% 24%, #fff7b2 0%, #fde047 22%,
            #eab308 52%, #a16207 76%, #713f12 100%);
          border: 4px solid #fef08a;
          box-shadow:
            inset 0 0 0 3px #ca8a04,
            inset 0 0 0 6px #fde68a,
            0 5px 0 #854d0e,
            0 9px 12px #0008;
          text-shadow: 0 1px 0 #fef3c7;
        }

        .gold-coin::after {
          content: "";
          position: absolute;
          inset: 7px;
          border: 2px solid rgba(133, 77, 14, 0.6);
          border-radius: 50%;
        }

        .coin-one {
          left: 3px;
          top: 25px;
          transform: rotate(-13deg);
        }

        .coin-two {
          left: 39px;
          top: 5px;
          z-index: 2;
        }

        .coin-three {
          left: 51px;
          top: 32px;
          transform: rotate(12deg);
        }

        .coin-package {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 14px;
          margin-top: 11px;
          background: #1e293b;
          border: 1px solid #475569;
          border-radius: 13px;
        }

        .coin-package-info {
          flex: 1;
          min-width: 0;
        }

        .coin-package-title {
          font-size: 16px;
          font-weight: 800;
        }

        .coin-package-subtitle {
          margin-top: 4px;
          font-size: 12px;
          color: #94a3b8;
        }

        .coin-price {
          color: #fde047;
          font-size: 16px;
          font-weight: 800;
          text-align: right;
        }

        .coin-package-art {
          width: 76px;
          height: 60px;
          flex-shrink: 0;
          position: relative;
        }

        .mini-stack {
          position: absolute;
          left: 5px;
          bottom: 2px;
          width: 48px;
          height: 15px;
          border-radius: 50%;
          background: linear-gradient(#fef08a, #ca8a04);
          border: 2px solid #fde047;
          box-shadow:
            0 -7px 0 #eab308,
            0 -9px 0 #fef08a,
            0 -16px 0 #ca8a04,
            0 -18px 0 #fde047,
            0 -25px 0 #eab308,
            0 -27px 0 #fef08a;
        }

        .mini-stack::after {
          content: "W";
          position: absolute;
          inset: -24px 0 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 17px;
          color: #854d0e;
          text-shadow: 0 1px #fef08a;
        }

        .coin-sparkle {
          position: absolute;
          right: 2px;
          top: 3px;
          color: #fef08a;
          font-size: 18px;
        }

        .wallet-note {
          padding: 11px;
          margin-top: 14px;
          border-radius: 9px;
          background: #172554;
          color: #cbd5e1;
          font-size: 12px;
          line-height: 1.6;
        }

        .cancel-button {
          width: 100%;
          padding: 12px;
          margin-top: 9px;
          background: #334155;
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
        }

        @media (max-width: 380px) {
          .wallet-page {
            padding: 12px;
          }

          .wallet-modal-content {
            padding: 15px;
          }

          .coin-package {
            gap: 8px;
            padding: 10px;
          }

          .coin-package-art {
            width: 60px;
          }
        }
      `}</style>

      {/* HEADER */}
      <div className="wallet-header">
        <h1 style={{ margin: 0 }}>
          💳 Wallet
        </h1>

        {promo ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>{promo.code}</span>
            <button onClick={copyCode} aria-label="Copy promo code">
              📋
            </button>
          </div>
        ) : (
          <button onClick={createPromo}>+ Code</button>
        )}
      </div>

      <p style={{ fontSize: 12, color: "#cbd5e1" }}>
        👥 {promo?.usedCount || 0} users joined
      </p>

      {/* WALLET BALANCE */}
      <div className="wallet-card">
        <h3 style={{ marginTop: 0 }}>Your balance</h3>

        <p>
          💰 Balance: ₦
          {Number(wallet?.balance || 0).toLocaleString()}
        </p>

        <p>
          🔒 Locked: ₦
          {Number(wallet?.locked || 0).toLocaleString()}
        </p>
      </div>

      {/* ZANGI */}
      <div className="wallet-card">
        <h3>💬 Zangi</h3>

        <input
          className="wallet-input"
          value={zangiContact}
          onChange={(e) => setZangiContact(e.target.value)}
          placeholder="Enter Zangi ID"
        />

        <button className="wallet-button" onClick={saveZangi}>
          Save Zangi
        </button>
      </div>

      {/* WALLET ACTIONS */}
      <button
        className="wallet-button"
        onClick={() => setShowDeposit(true)}
      >
        🪙 View Coin Packages
      </button>

      <button
        className="wallet-button"
        onClick={() => setShowWithdraw(true)}
      >
        ➖ Withdraw
      </button>

      <button className="wallet-button" onClick={copyInvite}>
        📋 Copy Invite
      </button>

      <button
        className="wallet-button"
        onClick={() => navigate("/dashboard")}
      >
        ⬅ Back to Dashboard
      </button>

      {/* COIN STORE MODAL */}
      {showDeposit && (
        <div
          className="wallet-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeposit(false);
            }
          }}
        >
          <div className="wallet-modal-content">
            <div className="wallet-header">
              <h2 style={{ margin: 0 }}>
                🪙 Win9ja Coins
              </h2>

              <button
                onClick={() => setShowDeposit(false)}
                aria-label="Close coin store"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "white",
                  fontSize: 24,
                  cursor: "pointer"
                }}
              >
                ×
              </button>
            </div>

            {/* HERO COIN ART */}
            <div className="coin-hero" style={{ marginTop: 16 }}>
              <div className="coin-stack" aria-label="Gold W coins">
                <div className="gold-coin coin-one">W</div>
                <div className="gold-coin coin-two">W</div>
                <div className="gold-coin coin-three">W</div>
              </div>

              <h3 style={{ margin: "8px 0 5px", color: "#fde047" }}>
                Collect Win9ja Coins
              </h3>

              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "#cbd5e1"
                }}
              >
                Gold coins • Win9ja Life
              </p>
            </div>

            {/* COUNTRY SELECTOR */}
            <label
              htmlFor="win9ja-country"
              style={{
                display: "block",
                marginTop: 18,
                fontSize: 13,
                fontWeight: 700
              }}
            >
              🌍 Select your country
            </label>

            <select
              id="win9ja-country"
              className="wallet-input"
              value={country}
              onChange={(e) => selectCountry(e.target.value)}
            >
              {Object.entries(currencies).map(([code, item]) => (
                <option key={code} value={code}>
                  {item.name} ({item.currency})
                </option>
              ))}
            </select>

            {/* RATE DISPLAY */}
            <div className="wallet-note">
              <strong>Reference currency: USD</strong>
              <br />

              {rateLoading
                ? "Loading exchange rate..."
                : exchangeRate !== null
                  ? `1 USD = ${exchangeRate.toLocaleString()} ${
                      currencies[country].currency
                    }`
                  : "Exchange rate unavailable. Try again later."}
            </div>

            {/* COIN PACKAGES */}
            <h3 style={{ marginTop: 20, marginBottom: 8 }}>
              Coin packages
            </h3>

            {coinPackages.map((item) => (
              <div className="coin-package" key={item.coins}>
                <div className="coin-package-art" aria-hidden="true">
                  <div
                    className="mini-stack"
                    style={{
                      transform:
                        item.coins >= 5000
                          ? "scale(1.12)"
                          : item.coins >= 2500
                            ? "scale(0.95)"
                            : item.coins >= 1000
                              ? "scale(0.8)"
                              : "scale(0.65)",
                      transformOrigin: "left bottom"
                    }}
                  />
                  <span className="coin-sparkle">✦</span>
                </div>

                <div className="coin-package-info">
                  <div className="coin-package-title">
                    {item.coins.toLocaleString()} Coins
                  </div>

                  <div className="coin-package-subtitle">
                    Illustrative package
                  </div>
                </div>

                <div className="coin-price">
                  {formatLocalPrice(item.usd)}
                  <div
                    style={{
                      color: "#94a3b8",
                      fontSize: 11,
                      marginTop: 4
                    }}
                  >
                    ${item.usd.toFixed(2)} USD
                  </div>
                </div>
              </div>
            ))}

            <div className="wallet-note">
              These are display examples, not active offers. Local
              prices are estimates based on an exchange-rate feed.
              No payment is collected and no coins are credited by
              this prototype.
            </div>

            <button
              className="wallet-button"
              onClick={makeDeposit}
            >
              Continue (Preview Only)
            </button>

            <button
              className="cancel-button"
              onClick={() => setShowDeposit(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* WITHDRAWAL PROTOTYPE */}
      {showWithdraw && (
        <div className="wallet-modal">
          <div className="wallet-modal-content">
            <h2>Withdraw</h2>

            <p style={{ color: "#cbd5e1", fontSize: 13 }}>
              Withdrawal processing is not enabled in this prototype.
            </p>

            <label htmlFor="withdraw-amount">Amount</label>
            <input
              id="withdraw-amount"
              className="wallet-input"
              type="number"
              min="0"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Enter amount"
            />

            <label htmlFor="withdraw-bank">Bank</label>
            <input
              id="withdraw-bank"
              className="wallet-input"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="Bank name"
            />

            <label htmlFor="withdraw-account-number">
              Account number
            </label>
            <input
              id="withdraw-account-number"
              className="wallet-input"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Account number"
            />

            <label htmlFor="withdraw-account-name">
              Account name
            </label>
            <input
              id="withdraw-account-name"
              className="wallet-input"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Account name"
            />

            <button
              className="wallet-button"
              onClick={requestWithdraw}
              disabled={withdrawLoading}
            >
              {withdrawLoading ? "Processing..." : "Preview Only"}
            </button>

            <button
              className="cancel-button"
              onClick={() => setShowWithdraw(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}