import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  ID,
  Query,
} from "../lib/appwrite";
import { getWallet } from "../lib/wallet";

const WITHDRAW_COLLECTION = "withdrawal_requests";

const CURRENCIES = [
  {
    code: "NGN",
    label: "₦ Nigerian Naira (NGN)",
    country: "NG",
    countryName: "Nigeria",
    symbol: "₦",
    minimum: 2000,
  },
  {
    code: "GHS",
    label: "GH₵ Ghanaian Cedi (GHS)",
    country: "GH",
    countryName: "Ghana",
    symbol: "GH₵",
    minimum: 2000,
  },
  {
    code: "GBP",
    label: "£ British Pound (GBP)",
    country: "GB",
    countryName: "United Kingdom",
    symbol: "£",
    minimum: 5000,
  },
  {
    code: "USD",
    label: "$ US Dollar (USD)",
    country: "US",
    countryName: "United States",
    symbol: "$",
    minimum: 5000,
  },
  {
    code: "CAD",
    label: "C$ Canadian Dollar (CAD)",
    country: "CA",
    countryName: "Canada",
    symbol: "C$",
    minimum: 5000,
  },
  {
    code: "KES",
    label: "KSh Kenyan Shilling (KES)",
    country: "KE",
    countryName: "Kenya",
    symbol: "KSh",
    minimum: 5000,
  },
  {
    code: "ZAR",
    label: "R South African Rand (ZAR)",
    country: "ZA",
    countryName: "South Africa",
    symbol: "R",
    minimum: 5000,
  },
];

export default function Withdraw() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [requests, setRequests] = useState([]);

  // Page 1: currency selection
  const [currency, setCurrency] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // Withdrawal form
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [trxAddress, setTrxAddress] = useState("");
  const [amount, setAmount] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedCurrency = CURRENCIES.find(
    (item) => item.code === currency
  );

  const isNigeria = currency === "NGN";
  const minimum = selectedCurrency?.minimum ?? 5000;
  const availableCoins = Number(wallet?.coins ?? 0);
  const requestedCoins = Number(amount);

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    setLoading(true);
    setError("");

    try {
      const currentUser = await account.get();
      setUser(currentUser);

      const walletData = await getWallet(currentUser.$id);
      setWallet(walletData);

      await loadRequests(currentUser.$id);
    } catch (err) {
      console.error("Failed to load withdrawal page:", err);
      setError(
        "Unable to load your wallet. Please log in and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests(userId) {
    try {
      const result = await databases.listDocuments(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        [
          Query.equal("userId", userId),
          Query.orderDesc("$createdAt"),
          Query.limit(50),
        ]
      );

      setRequests(result.documents || []);
    } catch (err) {
      console.error("Unable to load withdrawal history:", err);
    }
  }

  function handleCurrencyChange(event) {
    setCurrency(event.target.value);
    setConfirmed(false);

    setBank("");
    setAccountNumber("");
    setAccountName("");
    setTrxAddress("");
    setAmount("");

    setError("");
    setMessage("");
  }

  function handleNext() {
    setError("");
    setMessage("");

    if (!selectedCurrency) {
      setError("Please select your currency before continuing.");
      return;
    }

    setConfirmed(true);
  }

  function handleBack() {
    setConfirmed(false);
    setError("");
    setMessage("");
  }

  function useAllCoins() {
    if (availableCoins < minimum) {
      setError(
        `You need at least ${minimum.toLocaleString()} coins to withdraw.`
      );
      return;
    }

    setAmount(String(Math.floor(availableCoins)));
    setError("");
    setMessage("");
  }

  async function submitWithdrawal(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!user || !wallet) {
      setError("Your account or wallet could not be loaded.");
      return;
    }

    if (!confirmed || !selectedCurrency) {
      setError("Please select your currency and tap Next.");
      return;
    }

    const coins = Number(amount);

    if (
      !Number.isFinite(coins) ||
      !Number.isInteger(coins) ||
      coins <= 0
    ) {
      setError("Enter a valid whole-number coin amount.");
      return;
    }

    if (coins < minimum) {
      setError(
        `The minimum withdrawal is ${minimum.toLocaleString()} coins.`
      );
      return;
    }

    if (coins > availableCoins) {
      setError(
        `Insufficient balance. You have ${Math.floor(
          availableCoins
        ).toLocaleString()} coins available.`
      );
      return;
    }

    if (isNigeria) {
      if (!bank.trim()) {
        setError("Please enter your bank name.");
        return;
      }

      if (!accountName.trim()) {
        setError("Please enter the account holder's name.");
        return;
      }

      if (!/^\d{10}$/.test(accountNumber.trim())) {
        setError("Enter a valid 10-digit Nigerian bank account number.");
        return;
      }
    } else {
      const address = trxAddress.trim();

      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
        setError(
          "Enter a valid TRON/TRC20 receiving address beginning with T."
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      await databases.createDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        ID.unique(),
        {
          userId: user.$id,
          amount: coins,
          coins,
          country: selectedCurrency.country,
          currency: selectedCurrency.code,
          paymentMethod: isNigeria ? "BANK_TRANSFER" : "TRX",
          bank: isNigeria ? bank.trim() : "",
          accountNumber: isNigeria ? accountNumber.trim() : "",
          accountName: isNigeria ? accountName.trim() : "",
          trxAddress: isNigeria ? "" : trxAddress.trim(),
          status: "pending",
        }
      );

      setMessage(
        "Your withdrawal request has been submitted and is awaiting review."
      );

      setAmount("");
      setBank("");
      setAccountNumber("");
      setAccountName("");
      setTrxAddress("");

      await loadRequests(user.$id);
    } catch (err) {
      console.error("Withdrawal submission failed:", err);
      setError(
        err?.message ||
          "Unable to submit your request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Date unavailable"
      : date.toLocaleString();
  }

  function formatStatus(status) {
    if (!status) return "Pending";

    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  if (loading) {
    return (
      <div className="withdraw-page">
        <style>{styles}</style>

        <div className="withdraw-loading">
          <div className="withdraw-spinner" />
          <p>Loading your wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="withdraw-page">
      <style>{styles}</style>

      <main className="withdraw-container">
        <header className="withdraw-header">
          <div>
            <span className="withdraw-eyebrow">
              WIN9JA LIFE WALLET
            </span>

            <h1>Withdraw Coins</h1>

            <p className="withdraw-subtitle">
              Select your currency to view the withdrawal options
              available to you.
            </p>
          </div>

          <div className="wallet-balance-card">
            <span>Available balance</span>
            <strong>
              {Math.floor(availableCoins).toLocaleString()}
              <small> coins</small>
            </strong>
          </div>
        </header>

        {error && (
          <div className="withdraw-alert alert-error" role="alert">
            <strong>!</strong>
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="withdraw-alert alert-success" role="status">
            <strong>✓</strong>
            <span>{message}</span>
          </div>
        )}

        {/* PAGE 1: CURRENCY SELECTION ONLY */}
        {!confirmed && (
          <section className="withdraw-card currency-card">
            <div className="section-heading">
              <div className="step-number">1</div>

              <div>
                <h2>Select Your Currency</h2>
                <p>
                  Choose your preferred currency and tap Next to
                  reveal the appropriate withdrawal page.
                </p>
              </div>
            </div>

            <div className="currency-illustration">
              <div className="currency-symbol">¤</div>
              <div>
                <strong>Choose your currency</strong>
                <p>
                  Nigerian users will see bank transfer options.
                  International users will see TRX wallet options.
                </p>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="withdraw-currency">
                Your currency
              </label>

              <select
                id="withdraw-currency"
                className="withdraw-input currency-select"
                value={currency}
                onChange={handleCurrencyChange}
              >
                <option value="">-- Select your currency --</option>

                {CURRENCIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedCurrency && (
              <div className="selected-currency-preview">
                <span>Selected currency</span>
                <strong>
                  {selectedCurrency.symbol} {selectedCurrency.code}
                </strong>
                <small>{selectedCurrency.countryName}</small>
              </div>
            )}

            <button
              type="button"
              className="withdraw-button button-primary"
              onClick={handleNext}
              disabled={!currency}
            >
              Next
              <span aria-hidden="true"> →</span>
            </button>

            <p className="step-note">
              Your withdrawal details will appear on the next page.
            </p>
          </section>
        )}

        {/* PAGE 2: APPROPRIATE WITHDRAWAL PAGE */}
        {confirmed && selectedCurrency && (
          <>
            <section className="withdraw-card">
              <div className="section-heading">
                <div className="step-number">2</div>

                <div>
                  <h2>
                    {isNigeria
                      ? "Nigerian Withdrawal"
                      : "International Withdrawal"}
                  </h2>

                  <p>
                    {isNigeria
                      ? "Enter the Nigerian bank account where you want to receive payment."
                      : "Enter your TRON/TRC20 wallet address to request an international withdrawal."}
                  </p>
                </div>
              </div>

              <div className="selected-details">
                <div className="detail-box">
                  <span>Currency</span>
                  <strong>
                    {selectedCurrency.symbol} {selectedCurrency.code}
                  </strong>
                </div>

                <div className="detail-box">
                  <span>Country</span>
                  <strong>{selectedCurrency.countryName}</strong>
                </div>

                <div className="detail-box">
                  <span>Minimum withdrawal</span>
                  <strong>{minimum.toLocaleString()} coins</strong>
                </div>

                <div className="detail-box">
                  <span>Available balance</span>
                  <strong>
                    {Math.floor(availableCoins).toLocaleString()} coins
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="back-button"
                onClick={handleBack}
              >
                ← Change currency
              </button>

              {isNigeria ? (
                <div className="method-panel">
                  <div className="method-icon">🏦</div>
                  <div>
                    <h3>Nigerian Bank Transfer</h3>
                    <p>
                      Provide your Nigerian bank details. Ensure that
                      the account belongs to the intended recipient.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="method-panel">
                  <div className="method-icon">🔗</div>
                  <div>
                    <h3>TRON (TRC20) Wallet</h3>
                    <p>
                      Provide your own TRON-compatible receiving address.
                      The currency selection does not convert your coins
                      or guarantee a payout in the selected currency.
                    </p>
                  </div>
                </div>
              )}

              {availableCoins < minimum && (
                <div className="withdraw-alert alert-warning">
                  Your balance is below the minimum of{" "}
                  {minimum.toLocaleString()} coins. You need more coins
                  before you can submit a withdrawal request.
                </div>
              )}
            </section>

            <section className="withdraw-card">
              <div className="section-heading">
                <div className="step-number">3</div>

                <div>
                  <h2>Withdrawal Details</h2>
                  <p>
                    Enter the amount and your payment details below.
                  </p>
                </div>
              </div>

              <form onSubmit={submitWithdrawal}>
                <div className="amount-panel">
                  <div className="amount-heading">
                    <label htmlFor="withdraw-amount">
                      Amount to withdraw (coins)
                    </label>

                    <button
                      type="button"
                      className="use-all-button"
                      onClick={useAllCoins}
                      disabled={availableCoins < minimum}
                    >
                      Use all available
                    </button>
                  </div>

                  <input
                    id="withdraw-amount"
                    type="number"
                    inputMode="numeric"
                    className="withdraw-input amount-input"
                    min={minimum}
                    max={Math.floor(availableCoins)}
                    step="1"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setError("");
                      setMessage("");
                    }}
                    placeholder={`Minimum ${minimum.toLocaleString()} coins`}
                    required
                  />

                  <div className="amount-footer">
                    <span>
                      Minimum: {minimum.toLocaleString()} coins
                    </span>

                    <span>
                      Balance:{" "}
                      {Math.floor(availableCoins).toLocaleString()} coins
                    </span>
                  </div>
                </div>

                {isNigeria ? (
                  <div className="payment-form">
                    <h3>Bank Account Details</h3>

                    <div className="form-group">
                      <label htmlFor="withdraw-bank">
                        Bank name
                      </label>

                      <input
                        id="withdraw-bank"
                        className="withdraw-input"
                        type="text"
                        value={bank}
                        onChange={(event) => setBank(event.target.value)}
                        placeholder="Enter your bank name"
                        autoComplete="off"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="withdraw-account-name">
                        Account holder's name
                      </label>

                      <input
                        id="withdraw-account-name"
                        className="withdraw-input"
                        type="text"
                        value={accountName}
                        onChange={(event) =>
                          setAccountName(event.target.value)
                        }
                        placeholder="Enter account holder's name"
                        autoComplete="name"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="withdraw-account-number">
                        Account number
                      </label>

                      <input
                        id="withdraw-account-number"
                        className="withdraw-input"
                        type="text"
                        inputMode="numeric"
                        value={accountNumber}
                        onChange={(event) =>
                          setAccountNumber(
                            event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 10)
                          )
                        }
                        placeholder="10-digit account number"
                        autoComplete="off"
                        maxLength={10}
                        pattern="[0-9]{10}"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="payment-form">
                    <h3>International TRX Receiving Address</h3>

                    <div className="form-group">
                      <label htmlFor="withdraw-trx-address">
                        Your TRON/TRC20 wallet address
                      </label>

                      <input
                        id="withdraw-trx-address"
                        className="withdraw-input trx-input"
                        type="text"
                        value={trxAddress}
                        onChange={(event) =>
                          setTrxAddress(event.target.value.trim())
                        }
                        placeholder="Enter your TRON address starting with T"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck="false"
                        required
                      />

                      <small className="field-help">
                        Use an address compatible with the TRON network.
                        Check the address carefully before submitting.
                      </small>
                    </div>

                    <div className="network-warning">
                      <strong>Important network notice</strong>
                      <p>
                        Only use a compatible TRON/TRC20 address. Other
                        networks may not be supported. Never enter your
                        wallet recovery phrase or private key.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="withdraw-button button-primary submit-button"
                  disabled={
                    submitting ||
                    availableCoins < minimum ||
                    !amount ||
                    !Number.isInteger(requestedCoins) ||
                    requestedCoins < minimum ||
                    requestedCoins > availableCoins
                  }
                >
                  {submitting
                    ? "Submitting..."
                    : "Submit Withdrawal Request"}
                </button>

                <p className="submit-note">
                  Your request will be recorded as pending until it is
                  reviewed. Submitting a request does not mean payment
                  has been made.
                </p>
              </form>
            </section>
          </>
        )}

        {/* WITHDRAWAL HISTORY */}
        <section className="withdraw-card history-card">
          <div className="section-heading">
            <div className="history-icon">↻</div>

            <div>
              <h2>Withdrawal History</h2>
              <p>Review your recent withdrawal requests.</p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="empty-history">
              <div className="empty-icon">📋</div>
              <h3>No withdrawal requests yet</h3>
              <p>Your submitted requests will appear here.</p>
            </div>
          ) : (
            <div className="history-list">
              {requests.map((request) => {
                const requestCurrency = CURRENCIES.find(
                  (item) => item.code === request.currency
                );

                const isTrx =
                  request.paymentMethod === "TRX" ||
                  request.paymentMethod === "TRON";

                return (
                  <article
                    className="history-item"
                    key={request.$id}
                  >
                    <div className="history-top">
                      <div>
                        <strong className="history-amount">
                          {Number(
                            request.coins ?? request.amount ?? 0
                          ).toLocaleString()}{" "}
                          coins
                        </strong>

                        <span className="history-date">
                          {formatDate(request.$createdAt)}
                        </span>
                      </div>

                      <span
                        className={`status-badge status-${String(
                          request.status || "pending"
                        )
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, "")}`}
                      >
                        {formatStatus(request.status)}
                      </span>
                    </div>

                    <div className="history-meta">
                      <span>
                        Currency:{" "}
                        {request.currency || "Not specified"}
                      </span>

                      <span>
                        Country:{" "}
                        {requestCurrency?.countryName ||
                          request.country ||
                          "Not specified"}
                      </span>

                      <span>
                        Method:{" "}
                        {isTrx
                          ? "TRON/TRC20"
                          : request.paymentMethod === "BANK_TRANSFER"
                          ? "Bank transfer"
                          : request.paymentMethod || "Not specified"}
                      </span>
                    </div>

                    {isTrx && request.trxAddress && (
                      <div className="history-destination">
                        <span>TRX address</span>
                        <code>{request.trxAddress}</code>
                      </div>
                    )}

                    {!isTrx &&
                      (request.bank ||
                        request.accountName ||
                        request.accountNumber) && (
                        <div className="history-destination">
                          {request.bank && (
                            <span>Bank: {request.bank}</span>
                          )}

                          {request.accountName && (
                            <span>
                              Account name: {request.accountName}
                            </span>
                          )}

                          {request.accountNumber && (
                            <span>
                              Account number: {request.accountNumber}
                            </span>
                          )}
                        </div>
                      )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles = `
.withdraw-page {
  min-height: 100vh;
  padding: 24px 16px 48px;
  background: var(--app-bg, #f5f7fb);
  color: var(--app-text, #172033);
  box-sizing: border-box;
}

.withdraw-page *,
.withdraw-page *::before,
.withdraw-page *::after {
  box-sizing: border-box;
}

.withdraw-container {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}

.withdraw-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
}

.withdraw-eyebrow {
  display: inline-block;
  margin-bottom: 8px;
  color: #16a34a;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.4px;
}

.withdraw-header h1 {
  margin: 0;
  font-size: clamp(26px, 4vw, 36px);
  line-height: 1.2;
  font-weight: 800;
}

.withdraw-subtitle {
  max-width: 560px;
  margin: 10px 0 0;
  color: var(--app-muted, #687386);
  font-size: 14px;
  line-height: 1.6;
}

.wallet-balance-card {
  min-width: 180px;
  padding: 16px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 16px;
  background: var(--app-card, #fff);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.035);
}

.wallet-balance-card > span {
  display: block;
  margin-bottom: 8px;
  color: var(--app-muted, #687386);
  font-size: 12px;
}

.wallet-balance-card strong {
  color: #16a34a;
  font-size: 24px;
  overflow-wrap: anywhere;
}

.wallet-balance-card small {
  font-size: 12px;
  font-weight: 600;
}

.withdraw-card {
  margin-bottom: 20px;
  padding: 24px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 18px;
  background: var(--app-card, #fff);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.035);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 22px;
}

.section-heading h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
}

.section-heading p {
  margin: 6px 0 0;
  color: var(--app-muted, #687386);
  font-size: 13px;
  line-height: 1.6;
}

.step-number,
.history-icon {
  display: flex;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
  font-size: 16px;
  font-weight: 800;
}

.history-icon {
  font-size: 21px;
}

.currency-illustration {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
  padding: 17px;
  border: 1px solid rgba(22, 163, 74, 0.2);
  border-radius: 14px;
  background: rgba(22, 163, 74, 0.055);
}

.currency-symbol {
  display: flex;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(22, 163, 74, 0.13);
  color: #16a34a;
  font-size: 28px;
  font-weight: 800;
}

.currency-illustration strong {
  display: block;
  margin-bottom: 5px;
  font-size: 14px;
}

.currency-illustration p {
  margin: 0;
  color: var(--app-muted, #687386);
  font-size: 12px;
  line-height: 1.6;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.form-group label,
.amount-heading label {
  color: var(--app-text, #172033);
  font-size: 13px;
  font-weight: 700;
}

.withdraw-input {
  display: block;
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid var(--app-border, #dce2eb);
  border-radius: 11px;
  outline: none;
  background: var(--app-input, #fff);
  color: var(--app-text, #172033);
  font: inherit;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.withdraw-input:focus {
  border-color: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.12);
}

.withdraw-input::placeholder {
  color: var(--app-muted, #8992a2);
}

.currency-select {
  min-height: 54px;
  font-weight: 600;
}

.selected-currency-preview {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 20px;
  padding: 14px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 11px;
  background: var(--app-bg, #f8fafc);
}

.selected-currency-preview span,
.selected-currency-preview small {
  color: var(--app-muted, #687386);
  font-size: 12px;
}

.selected-currency-preview strong {
  color: #16a34a;
  font-size: 18px;
}

.withdraw-button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 18px;
  border: none;
  border-radius: 11px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
}

.withdraw-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.withdraw-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-primary {
  background: #16a34a;
  color: #fff;
  box-shadow: 0 5px 14px rgba(22, 163, 74, 0.17);
}

.button-primary:hover:not(:disabled) {
  background: #15803d;
}

.currency-card > .withdraw-button {
  width: 100%;
}

.step-note,
.submit-note {
  margin: 12px 0 0;
  color: var(--app-muted, #687386);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

.selected-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.detail-box {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 15px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 12px;
  background: var(--app-bg, #f8fafc);
}

.detail-box span {
  color: var(--app-muted, #687386);
  font-size: 12px;
}

.detail-box strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.back-button {
  margin-bottom: 18px;
  padding: 9px 12px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 9px;
  background: var(--app-card, #fff);
  color: var(--app-text, #172033);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.method-panel {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(22, 163, 74, 0.22);
  border-radius: 13px;
  background: rgba(22, 163, 74, 0.055);
}

.method-icon {
  display: flex;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(22, 163, 74, 0.12);
  font-size: 21px;
}

.method-panel h3 {
  margin: 0 0 6px;
  font-size: 14px;
}

.method-panel p {
  margin: 0;
  color: var(--app-muted, #687386);
  font-size: 13px;
  line-height: 1.65;
}

.withdraw-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.alert-error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.alert-success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.alert-warning {
  margin: 18px 0 0;
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.amount-panel {
  margin-bottom: 24px;
  padding: 18px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 14px;
  background: var(--app-bg, #f8fafc);
}

.amount-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.use-all-button {
  padding: 7px 10px;
  border: 1px solid rgba(22, 163, 74, 0.3);
  border-radius: 8px;
  background: rgba(22, 163, 74, 0.08);
  color: #16a34a;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.use-all-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.amount-input {
  min-height: 58px;
  font-size: 20px;
  font-weight: 800;
}

.amount-footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  color: var(--app-muted, #687386);
  font-size: 11px;
}

.payment-form {
  margin-bottom: 24px;
}

.payment-form > h3 {
  margin: 0 0 18px;
  font-size: 15px;
}

.field-help {
  display: block;
  margin-top: 2px;
  color: var(--app-muted, #687386);
  font-size: 12px;
  line-height: 1.55;
}

.network-warning {
  padding: 14px;
  border: 1px solid #fde68a;
  border-radius: 11px;
  background: #fffbeb;
  color: #92400e;
}

.network-warning strong {
  display: block;
  margin-bottom: 5px;
  font-size: 13px;
}

.network-warning p {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
}

.submit-button {
  width: 100%;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.history-item {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 13px;
}

.history-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.history-amount {
  display: block;
  font-size: 17px;
  font-weight: 800;
}

.history-date {
  display: block;
  margin-top: 5px;
  color: var(--app-muted, #687386);
  font-size: 11px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 20px;
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.status-approved,
.status-completed,
.status-paid {
  background: #dcfce7;
  color: #166534;
}

.status-rejected,
.status-failed,
.status-cancelled {
  background: #fee2e2;
  color: #991b1b;
}

.status-processing,
.status-pending {
  background: #fef3c7;
  color: #92400e;
}

.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  color: var(--app-muted, #687386);
  font-size: 12px;
  line-height: 1.6;
}

.history-destination {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border, #e4e8ef);
  color: var(--app-muted, #687386);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.history-destination code {
  display: block;
  padding: 8px;
  border-radius: 7px;
  background: var(--app-bg, #f8fafc);
  color: var(--app-text, #172033);
  font-size: 11px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.empty-history {
  padding: 32px 12px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 10px;
  font-size: 30px;
}

.empty-history h3 {
  margin: 0;
  font-size: 15px;
}

.empty-history p {
  margin: 8px 0 0;
  color: var(--app-muted, #687386);
  font-size: 13px;
}

.withdraw-loading {
  display: flex;
  min-height: 50vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--app-muted, #687386);
}

.withdraw-spinner {
  width: 34px;
  height: 34px;
  border: 3px solid var(--app-border, #e4e8ef);
  border-top-color: #16a34a;
  border-radius: 50%;
  animation: withdraw-spin 0.8s linear infinite;
}

@keyframes withdraw-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .withdraw-page {
    padding: 18px 12px 36px;
  }

  .withdraw-header {
    flex-direction: column;
  }

  .wallet-balance-card {
    width: 100%;
  }

  .withdraw-card {
    padding: 18px 15px;
    border-radius: 15px;
  }

  .selected-details {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .section-heading h2 {
    font-size: 17px;
  }

  .amount-panel {
    padding: 14px;
  }

  .amount-heading {
    align-items: flex-start;
  }

  .history-top {
    align-items: flex-start;
  }

  .history-meta {
    flex-direction: column;
    gap: 5px;
  }

  .withdraw-button {
    width: 100%;
  }
}

@keyframes withdraw-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .withdraw-spinner {
    animation: none;
  }

  .withdraw-button {
    transition: none;
  }
}
`;