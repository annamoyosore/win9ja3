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

const MIN_WITHDRAWAL = {
  NG: 2000,
  GH: 2000,
  OTHER: 5000,
};

const countries = [
  { code: "NG", name: "Nigeria", currency: "NGN", symbol: "₦" },
  { code: "GH", name: "Ghana", currency: "GHS", symbol: "GH₵" },
  { code: "GB", name: "United Kingdom", currency: "GBP", symbol: "£" },
  { code: "US", name: "United States", currency: "USD", symbol: "$" },
  { code: "CA", name: "Canada", currency: "CAD", symbol: "C$" },
  { code: "KE", name: "Kenya", currency: "KES", symbol: "KSh" },
  { code: "ZA", name: "South Africa", currency: "ZAR", symbol: "R" },
  { code: "OTHER", name: "Other country", currency: "USD", symbol: "$" },
];

export default function Withdraw() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [trxAddress, setTrxAddress] = useState("");
  const [amount, setAmount] = useState("");

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCountry = countries.find(
    (item) => item.code === country
  );

  const minimum =
    MIN_WITHDRAWAL[country] ?? MIN_WITHDRAWAL.OTHER;

  const availableCoins = Number(wallet?.coins ?? 0);
  const requestedCoins = Number(amount);
  const isNigeria = country === "NG";

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
      console.error("Failed to initialize withdrawal page:", err);
      setError(
        "Unable to load your withdrawal information. Please log in and try again."
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
      console.error("Failed to load withdrawal history:", err);
    }
  }

  function handleCountryChange(event) {
    const selectedCode = event.target.value;
    const selected = countries.find(
      (item) => item.code === selectedCode
    );

    setCountry(selectedCode);
    setCurrency(selected?.currency || "");
    setConfirmed(false);

    setAmount("");
    setBank("");
    setAccountNumber("");
    setAccountName("");
    setTrxAddress("");

    setMessage("");
    setError("");
  }

  function confirmSelection() {
    setError("");
    setMessage("");

    if (!selectedCountry || !currency) {
      setError("Please select your country first.");
      return;
    }

    setConfirmed(true);
  }

  function useAllAvailableCoins() {
    if (availableCoins < minimum) {
      setError(
        `Your balance must be at least ${minimum.toLocaleString()} coins before you can withdraw.`
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
      setError("Your account or wallet could not be loaded. Please try again.");
      return;
    }

    if (!confirmed || !selectedCountry || !currency) {
      setError("Please select your country before continuing.");
      return;
    }

    const coins = Number(amount);

    if (!Number.isFinite(coins) || !Number.isInteger(coins) || coins <= 0) {
      setError("Enter a valid whole-number coin amount.");
      return;
    }

    if (coins < minimum) {
      setError(
        `The minimum withdrawal for your selected country is ${minimum.toLocaleString()} coins.`
      );
      return;
    }

    if (coins > availableCoins) {
      setError(
        `Insufficient balance. You currently have ${Math.floor(
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
      const cleanedAddress = trxAddress.trim();

      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(cleanedAddress)) {
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
          country,
          currency,
          paymentMethod: isNigeria ? "BANK_TRANSFER" : "TRX",
          bank: isNigeria ? bank.trim() : "",
          accountNumber: isNigeria ? accountNumber.trim() : "",
          accountName: isNigeria ? accountName.trim() : "",
          trxAddress: isNigeria ? "" : trxAddress.trim(),
          status: "pending",
        }
      );

      setMessage(
        "Your withdrawal request has been submitted successfully and is awaiting review."
      );

      setAmount("");
      setBank("");
      setAccountNumber("");
      setAccountName("");
      setTrxAddress("");

      await loadRequests(user.$id);
    } catch (err) {
      console.error("Withdrawal request failed:", err);

      setError(
        err?.message ||
          "Unable to submit your withdrawal request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "Date unavailable";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString();
  }

  function formatStatus(status) {
    if (!status) return "Pending";

    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  if (loading) {
    return (
      <div className="withdraw-page">
        <div className="withdraw-loading">
          <div className="withdraw-spinner" />
          <p>Loading your wallet...</p>
        </div>

        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="withdraw-page">
      <style>{styles}</style>

      <div className="withdraw-container">
        <header className="withdraw-header">
          <div>
            <span className="withdraw-eyebrow">WIN9JA LIFE WALLET</span>
            <h1>Withdraw Coins</h1>
            <p className="withdraw-subtitle">
              Choose your country, review the requirements, and submit
              your withdrawal request.
            </p>
          </div>

          <div className="wallet-balance-card">
            <span>Available balance</span>
            <strong>
              {Math.floor(availableCoins).toLocaleString()}{" "}
              <small>coins</small>
            </strong>
          </div>
        </header>

        {error && (
          <div className="withdraw-alert withdraw-alert-error" role="alert">
            <span className="alert-icon">!</span>
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div
            className="withdraw-alert withdraw-alert-success"
            role="status"
          >
            <span className="alert-icon">✓</span>
            <span>{message}</span>
          </div>
        )}

        {/* STEP 1: COUNTRY AND CURRENCY */}
        <section className="withdraw-card">
          <div className="section-heading">
            <div className="step-number">1</div>
            <div>
              <h2>Select your country</h2>
              <p>Your selection determines the withdrawal requirements.</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="withdraw-country">Country or region</label>

              <select
                id="withdraw-country"
                value={country}
                onChange={handleCountryChange}
                className="withdraw-input"
              >
                <option value="">Choose your country</option>

                {countries.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="withdraw-currency">Currency</label>

              <input
                id="withdraw-currency"
                className="withdraw-input"
                value={
                  selectedCountry
                    ? `${selectedCountry.symbol} ${selectedCountry.currency}`
                    : ""
                }
                placeholder="Select a country first"
                readOnly
              />

              <small className="field-help">
                Currency is assigned according to your selected country.
              </small>
            </div>
          </div>

          <button
            type="button"
            className="withdraw-button withdraw-button-primary"
            onClick={confirmSelection}
            disabled={!country}
          >
            Next — View Withdrawal Requirements
            <span aria-hidden="true"> →</span>
          </button>
        </section>

        {/* STEP 2: COUNTRY REQUIREMENTS */}
        {confirmed && selectedCountry && (
          <>
            <section className="withdraw-card requirements-card">
              <div className="section-heading">
                <div className="step-number">2</div>
                <div>
                  <h2>Withdrawal requirements</h2>
                  <p>
                    Requirements for {selectedCountry.name}.
                  </p>
                </div>
              </div>

              <div className="requirements-summary">
                <div className="requirement-item">
                  <span>Selected country</span>
                  <strong>{selectedCountry.name}</strong>
                </div>

                <div className="requirement-item">
                  <span>Currency</span>
                  <strong>{selectedCountry.currency}</strong>
                </div>

                <div className="requirement-item">
                  <span>Minimum withdrawal</span>
                  <strong>{minimum.toLocaleString()} coins</strong>
                </div>

                <div className="requirement-item">
                  <span>Available balance</span>
                  <strong>
                    {Math.floor(availableCoins).toLocaleString()} coins
                  </strong>
                </div>

                <div className="requirement-item">
                  <span>Withdrawal method</span>
                  <strong>
                    {isNigeria
                      ? "Nigerian bank transfer"
                      : "TRON (TRC20) wallet"}
                  </strong>
                </div>
              </div>

              {isNigeria ? (
                <div className="method-information">
                  <div className="method-icon">🏦</div>
                  <div>
                    <h3>Nigerian bank transfer</h3>
                    <p>
                      Enter your bank name, account holder's name, and
                      10-digit account number. Make sure the details are
                      correct before submitting your request.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="method-information">
                  <div className="method-icon">🔗</div>
                  <div>
                    <h3>TRON (TRC20) wallet</h3>
                    <p>
                      Provide your own TRON/TRC20 receiving address.
                      Confirm that your receiving wallet supports TRON
                      (TRX/TRC20) before submitting.
                    </p>
                  </div>
                </div>
              )}

              {availableCoins < minimum && (
                <div className="withdraw-alert withdraw-alert-warning">
                  Your current balance is below the minimum withdrawal
                  requirement. You need at least{" "}
                  {minimum.toLocaleString()} coins to submit a request.
                </div>
              )}
            </section>

            {/* STEP 3: WITHDRAWAL FORM */}
            <section className="withdraw-card">
              <div className="section-heading">
                <div className="step-number">3</div>
                <div>
                  <h2>Enter withdrawal details</h2>
                  <p>
                    Complete the form carefully before submitting.
                  </p>
                </div>
              </div>

              <form onSubmit={submitWithdrawal}>
                <div className="amount-panel">
                  <div className="amount-panel-top">
                    <label htmlFor="withdraw-amount">
                      Amount to withdraw (coins)
                    </label>

                    <button
                      type="button"
                      className="use-all-button"
                      onClick={useAllAvailableCoins}
                      disabled={availableCoins < minimum}
                    >
                      Use all available
                    </button>
                  </div>

                  <input
                    id="withdraw-amount"
                    type="number"
                    inputMode="numeric"
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
                    className="withdraw-input amount-input"
                    required
                  />

                  <div className="amount-details">
                    <span>
                      Minimum: {minimum.toLocaleString()} coins
                    </span>
                    <span>
                      Available:{" "}
                      {Math.floor(availableCoins).toLocaleString()} coins
                    </span>
                  </div>
                </div>

                {isNigeria ? (
                  <div className="payment-details">
                    <h3 className="form-section-title">
                      Bank account details
                    </h3>

                    <div className="form-group">
                      <label htmlFor="withdraw-bank">Bank name</label>
                      <input
                        id="withdraw-bank"
                        type="text"
                        value={bank}
                        onChange={(event) => setBank(event.target.value)}
                        placeholder="e.g. Access Bank"
                        className="withdraw-input"
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
                        type="text"
                        value={accountName}
                        onChange={(event) =>
                          setAccountName(event.target.value)
                        }
                        placeholder="Enter the account name"
                        className="withdraw-input"
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
                        type="text"
                        inputMode="numeric"
                        value={accountNumber}
                        onChange={(event) =>
                          setAccountNumber(
                            event.target.value.replace(/\D/g, "").slice(0, 10)
                          )
                        }
                        placeholder="Enter your 10-digit account number"
                        className="withdraw-input"
                        autoComplete="off"
                        maxLength={10}
                        minLength={10}
                        pattern="[0-9]{10}"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="payment-details">
                    <h3 className="form-section-title">
                      TRON/TRC20 receiving address
                    </h3>

                    <div className="form-group">
                      <label htmlFor="withdraw-trx-address">
                        Your TRX wallet address
                      </label>
                      <input
                        id="withdraw-trx-address"
                        type="text"
                        value={trxAddress}
                        onChange={(event) =>
                          setTrxAddress(event.target.value.trim())
                        }
                        placeholder="Enter your TRON address starting with T"
                        className="withdraw-input trx-input"
                        autoComplete="off"
                        spellCheck="false"
                        autoCapitalize="none"
                        required
                      />

                      <small className="field-help">
                        Use a receiving address from a wallet or exchange
                        that supports TRON/TRC20. Double-check the address
                        before submitting.
                      </small>
                    </div>

                    <div className="network-warning">
                      <strong>Network warning</strong>
                      <p>
                        Only enter a TRON/TRC20 address. Addresses for
                        other networks may not be compatible. A withdrawal
                        request is not a completed or guaranteed payment.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="withdraw-button withdraw-button-primary submit-button"
                  disabled={
                    submitting ||
                    availableCoins < minimum ||
                    !amount ||
                    requestedCoins < minimum ||
                    requestedCoins > availableCoins
                  }
                >
                  {submitting
                    ? "Submitting request..."
                    : "Submit Withdrawal Request"}
                </button>

                <p className="submit-disclaimer">
                  Requests are submitted for review. Submitting a request
                  does not mean payment has been sent.
                </p>
              </form>
            </section>
          </>
        )}

        {/* WITHDRAWAL HISTORY */}
        <section className="withdraw-card history-card">
          <div className="section-heading">
            <div className="history-heading-icon">↻</div>
            <div>
              <h2>Withdrawal history</h2>
              <p>Track your recent withdrawal requests.</p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="empty-history">
              <div className="empty-history-icon">📋</div>
              <h3>No withdrawal requests yet</h3>
              <p>Your submitted requests will appear here.</p>
            </div>
          ) : (
            <div className="withdrawal-list">
              {requests.map((request) => {
                const requestCountry = countries.find(
                  (item) => item.code === request.country
                );

                const isTrx =
                  request.paymentMethod === "TRX" ||
                  request.paymentMethod === "TRON";

                return (
                  <article
                    className="withdrawal-history-item"
                    key={request.$id}
                  >
                    <div className="history-item-top">
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
                        Country:{" "}
                        {requestCountry?.name ||
                          request.country ||
                          "Not specified"}
                      </span>

                      <span>
                        Currency: {request.currency || "Not specified"}
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
                        request.accountNumber ||
                        request.accountName) && (
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
      </div>
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
  background: var(--app-card, #ffffff);
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
  background: var(--app-card, #ffffff);
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
  line-height: 1.5;
}

.step-number,
.history-heading-icon {
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

.history-heading-icon {
  font-size: 21px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.form-group label,
.amount-panel label {
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
  background: var(--app-input, #ffffff);
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
  opacity: 0.85;
}

.withdraw-input:read-only {
  opacity: 0.85;
  cursor: default;
}

.field-help {
  display: block;
  margin-top: 2px;
  color: var(--app-muted, #687386);
  font-size: 12px;
  line-height: 1.55;
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
  transition: transform 0.15s, opacity 0.15s, box-shadow 0.15s;
}

.withdraw-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.withdraw-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.withdraw-button-primary {
  background: #16a34a;
  color: #ffffff;
  box-shadow: 0 5px 14px rgba(22, 163, 74, 0.17);
}

.withdraw-button-primary:hover:not(:disabled) {
  background: #15803d;
}

.requirements-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.requirement-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 15px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 12px;
  background: var(--app-bg, #f8fafc);
}

.requirement-item span {
  color: var(--app-muted, #687386);
  font-size: 12px;
}

.requirement-item strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.method-information {
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

.method-information h3 {
  margin: 0 0 6px;
  font-size: 14px;
}

.method-information p {
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

.withdraw-alert-error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.withdraw-alert-success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.withdraw-alert-warning {
  margin: 18px 0 0;
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.alert-icon {
  display: inline-flex;
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  font-weight: 900;
}

.amount-panel {
  margin-bottom: 24px;
  padding: 18px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 14px;
  background: var(--app-bg, #f8fafc);
}

.amount-panel-top {
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

.amount-details {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  color: var(--app-muted, #687386);
  font-size: 11px;
}

.payment-details {
  margin-bottom: 24px;
}

.form-section-title {
  margin: 0 0 18px;
  font-size: 15px;
  font-weight: 800;
}

.trx-input {
  overflow-wrap: anywhere;
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

.submit-disclaimer {
  margin: 12px 0 0;
  color: var(--app-muted, #687386);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

.empty-history {
  padding: 32px 12px;
  text-align: center;
}

.empty-history-icon {
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

.withdrawal-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.withdrawal-history-item {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--app-border, #e4e8ef);
  border-radius: 13px;
}

.history-item-top {
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

  .form-grid,
  .requirements-summary {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .section-heading h2 {
    font-size: 17px;
  }

  .amount-panel {
    padding: 14px;
  }

  .amount-panel-top {
    align-items: flex-start;
  }

  .history-item-top {
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

@media (prefers-reduced-motion: reduce) {
  .withdraw-spinner {
    animation: none;
  }

  .withdraw-button {
    transition: none;
  }
}
`;