import { useEffect, useState } from "react";
import { account, databases, DATABASE_ID, ID, Query } from "../lib/appwrite";
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

// Start without a country selected or withdrawal criteria displayed.
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

const minimum = MIN_WITHDRAWAL[country] ?? MIN_WITHDRAWAL.OTHER;
const isNigeria = country === "NG";

useEffect(() => {
initialize();
}, []);

async function initialize() {
try {
setLoading(true);

  const currentUser = await account.get();
  setUser(currentUser);

  const currentWallet = await getWallet(currentUser.$id);
  setWallet(currentWallet);

  await loadRequests(currentUser.$id);
} catch (err) {
  console.error("Withdrawal initialization error:", err);
  setError("Unable to load your wallet. Please sign in and try again.");
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

  setRequests(result.documents);
} catch (err) {
  console.error("Unable to load withdrawal requests:", err);
}

}

function handleCountryChange(event) {
const selectedCode = event.target.value;
const selected = countries.find((item) => item.code === selectedCode);

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

function confirmSelection(event) {
event.preventDefault();
setError("");
setMessage("");

if (!selectedCountry || !currency) {
  setError("Please select your country and currency first.");
  return;
}

setConfirmed(true);

}

async function submitWithdrawal(event) {
event.preventDefault();

setMessage("");
setError("");

if (!confirmed || !selectedCountry || !currency) {
  setError("Please select and confirm your country and currency first.");
  return;
}

if (!user || !wallet) {
  setError("Please sign in before requesting a withdrawal.");
  return;
}

const coins = Number(amount);
const availableCoins = Number(wallet.coins || 0);

if (!Number.isSafeInteger(coins) || coins <= 0) {
  setError("Enter a valid whole number of coins.");
  return;
}

if (coins < minimum) {
  setError(
    `The minimum withdrawal for your selected country is ${minimum.toLocaleString()} coins.`
  );
  return;
}

if (coins > availableCoins) {
  setError("You do not have enough available coins.");
  return;
}

if (isNigeria) {
  if (!bank.trim() || !accountName.trim()) {
    setError("Enter your bank name and account name.");
    return;
  }

  if (!/^\d{10}$/.test(accountNumber.trim())) {
    setError("Enter a valid 10-digit Nigerian bank account number.");
    return;
  }
} else {
  const address = trxAddress.trim();

  if (!address) {
    setError("Enter your TRX receiving wallet address.");
    return;
  }

  // TRON mainnet addresses are normally 34 characters and begin with T.
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
    setError(
      "Enter a valid TRON mainnet address. Check the address carefully before submitting."
    );
    return;
  }
}

try {
  setSubmitting(true);

  // This creates a pending request only.
  // It does not deduct coins or send cryptocurrency.
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

  setAmount("");
  setBank("");
  setAccountNumber("");
  setAccountName("");
  setTrxAddress("");

  setMessage(
    "Your withdrawal request has been submitted successfully. Your coins have not been deducted. Please wait for admin review and payment."
  );

  await loadRequests(user.$id);
} catch (err) {
  console.error("Withdrawal submission error:", err);

  setError(
    "Unable to submit your request. Check the Appwrite collection attributes and permissions, then try again."
  );
} finally {
  setSubmitting(false);
}

}

if (loading) {
return (
<div style={styles.page}>
<div style={styles.container}>
<div style={styles.card}>Loading your wallet...</div>
</div>
</div>
);
}

if (!user) {
return (
<div style={styles.page}>
<div style={styles.container}>
<div style={styles.card}>
<h2>Sign in required</h2>
<p>Please sign in to request a withdrawal.</p>
</div>
</div>
</div>
);
}

return (
<div style={styles.page}>
<div style={styles.container}>
<header style={styles.header}>
<div>
<div style={styles.logo}>WIN9JA LIFE</div>
<h1 style={styles.heading}>Withdraw Coins</h1>
<p style={styles.subtitle}>
Select your country and currency to view withdrawal options.
</p>
</div>

      <div style={styles.coinCard}>
        <span style={styles.smallLabel}>Available coins</span>
        <strong style={styles.coinAmount}>
          {Number(wallet?.coins || 0).toLocaleString()}
        </strong>
        <span style={styles.coinLabel}>WIN9JA COINS</span>
      </div>
    </header>

    {message && <div style={styles.success}>{message}</div>}
    {error && <div style={styles.error}>{error}</div>}

    <section style={styles.card}>
      <div style={styles.stepBadge}>STEP 1</div>
      <h2 style={styles.sectionTitle}>Choose your country and currency</h2>

      <form onSubmit={confirmSelection}>
        <label style={styles.label}>Country or region</label>

        <select
          value={country}
          onChange={handleCountryChange}
          style={styles.input}
          required
        >
          <option value="">Select your country</option>
          {countries.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>

        {selectedCountry && (
          <>
            <label style={styles.label}>Currency</label>

            <select
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value);
                setConfirmed(false);
                setMessage("");
                setError("");
              }}
              style={styles.input}
              required
            >
              <option value={selectedCountry.currency}>
                {selectedCountry.currency} ({selectedCountry.symbol})
              </option>
            </select>

            <div style={styles.notice}>
              <strong>Selected:</strong> {selectedCountry.name}
              <br />
              <strong>Currency:</strong> {currency}
              <br />
              <span>
                You must confirm this selection before the withdrawal
                criteria and payment form are displayed.
              </span>
            </div>

            <button type="submit" style={styles.submitButton}>
              Confirm country and currency
            </button>
          </>
        )}
      </form>
    </section>

    {confirmed && selectedCountry && (
      <>
        <section style={styles.card}>
          <div style={styles.stepBadge}>STEP 2</div>
          <h2 style={styles.sectionTitle}>Your withdrawal criteria</h2>

          <div style={styles.criteriaCard}>
            <span style={styles.smallLabel}>Selected country</span>
            <strong style={styles.criteriaValue}>
              {selectedCountry.name}
            </strong>

            <span style={styles.smallLabel}>Selected currency</span>
            <strong style={styles.criteriaValue}>{currency}</strong>

            <span style={styles.smallLabel}>Minimum withdrawal</span>
            <strong style={styles.minimumValue}>
              {minimum.toLocaleString()} coins
            </strong>

            <span style={styles.smallLabel}>Payment method</span>
            <strong style={styles.criteriaValue}>
              {isNigeria ? "Nigerian bank transfer" : "TRON (TRX)"}
            </strong>
          </div>

          <p style={styles.muted}>
            The minimum is expressed in Win9ja coins, not in the selected
            country's currency. Confirm the applicable payout value before
            submitting a request.
          </p>
        </section>

        <section style={styles.card}>
          <div style={styles.stepBadge}>STEP 3</div>
          <h2 style={styles.sectionTitle}>Withdrawal details</h2>

          <form onSubmit={submitWithdrawal}>
            <label style={styles.label}>Number of coins to withdraw</label>

            <input
              type="number"
              min={minimum}
              max={Number(wallet?.coins || 0)}
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Minimum ${minimum.toLocaleString()} coins`}
              style={styles.input}
              required
            />

            <button
              type="button"
              style={styles.maxButton}
              onClick={() =>
                setAmount(String(Number(wallet?.coins || 0)))
              }
            >
              Use all available coins
            </button>

            {isNigeria ? (
              <>
                <h3 style={styles.subheading}>Nigerian bank account</h3>

                <label style={styles.label}>Bank name</label>
                <input
                  type="text"
                  value={bank}
                  onChange={(event) => setBank(event.target.value)}
                  placeholder="Enter your bank name"
                  style={styles.input}
                  required
                />

                <label style={styles.label}>Account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(event) =>
                    setAccountNumber(
                      event.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                  placeholder="10-digit account number"
                  style={styles.input}
                  required
                />

                <label style={styles.label}>Account name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  placeholder="Name on your bank account"
                  style={styles.input}
                  required
                />
              </>
            ) : (
              <>
                <h3 style={styles.subheading}>
                  International TRX withdrawal
                </h3>

                <div style={styles.trxCard}>
                  <div style={styles.trxIcon}>₮</div>
                  <strong>TRON network (TRC20)</strong>
                  <p style={styles.trxDescription}>
                    Enter your own TRON-compatible wallet address. This is
                    the destination where your approved withdrawal may be
                    sent.
                  </p>
                </div>

                <label style={styles.label}>Your TRX receiving address</label>
                <input
                  type="text"
                  value={trxAddress}
                  onChange={(event) => setTrxAddress(event.target.value)}
                  placeholder="TRON address beginning with T"
                  style={styles.input}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />

                <div style={styles.warning}>
                  <strong>Network warning:</strong> Only enter an address
                  that supports receiving assets on the TRON network.
                  Sending assets to an incompatible address can result in
                  permanent loss. Double-check the address before
                  submitting.
                </div>
              </>
            )}

            <div style={styles.warning}>
              <strong>Important:</strong> This form submits a withdrawal
              request for admin review. It does not send a bank transfer or
              cryptocurrency automatically, and it does not deduct coins.
              Do not submit unless you understand the withdrawal terms.
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                ...styles.submitButton,
                opacity: submitting ? 0.65 : 1,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting
                ? "Submitting request..."
                : "Submit withdrawal request"}
            </button>
          </form>
        </section>
      </>
    )}

    <section style={styles.card}>
      <h2 style={styles.sectionTitle}>Your withdrawal history</h2>

      {requests.length === 0 ? (
        <p style={styles.muted}>
          You have not made any withdrawal requests yet.
        </p>
      ) : (
        <div style={styles.historyList}>
          {requests.map((request) => (
            <div key={request.$id} style={styles.historyItem}>
              <div style={{ minWidth: 0 }}>
                <strong>
                  {Number(request.coins ?? request.amount ?? 0).toLocaleString()}{" "}
                  coins
                </strong>

                <div style={styles.historyDetails}>
                  {request.paymentMethod === "TRX"
                    ? "TRX withdrawal"
                    : request.paymentMethod === "BANK_TRANSFER"
                    ? "Bank transfer"
                    : request.bank || request.paymentMethod || "Withdrawal"}
                  {" · "}
                  {request.country || "Unknown country"}
                  {" · "}
                  {request.currency || ""}
                </div>

                <div style={styles.historyDetails}>
                  {request.paymentMethod === "TRX" && request.trxAddress
                    ? `TRX address: ${request.trxAddress}`
                    : request.bank || ""}
                </div>

                <div style={styles.historyDate}>
                  {request.$createdAt
                    ? new Date(request.$createdAt).toLocaleString()
                    : ""}
                </div>
              </div>

              <span
                style={{
                  ...styles.status,
                  ...(request.status === "paid"
                    ? styles.statusPaid
                    : request.status === "rejected"
                    ? styles.statusRejected
                    : request.status === "approved"
                    ? styles.statusApproved
                    : styles.statusPending),
                }}
              >
                {request.status || "pending"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>

    <p style={styles.footer}>
      Win9ja Life · Secure withdrawal requests
    </p>
  </div>
</div>

);
}

const styles = {
page: {
minHeight: "100vh",
background: "var(--app-bg, #07111f)",
color: "var(--app-text, #f8fafc)",
padding: "24px 14px",
boxSizing: "border-box",
fontFamily: "Arial, sans-serif",
},
container: {
maxWidth: "760px",
margin: "0 auto",
},
header: {
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: "18px",
flexWrap: "wrap",
marginBottom: "24px",
},
logo: {
color: "#4ade80",
fontWeight: "bold",
letterSpacing: "2px",
fontSize: "13px",
marginBottom: "10px",
},
heading: {
fontSize: "30px",
margin: "0 0 8px",
},
subtitle: {
color: "var(--app-muted, #aab8ca)",
margin: 0,
lineHeight: 1.5,
},
coinCard: {
minWidth: "145px",
background: "#102b25",
border: "1px solid #226b4c",
borderRadius: "16px",
padding: "18px",
display: "flex",
flexDirection: "column",
gap: "7px",
},
smallLabel: {
color: "#b9d9c8",
fontSize: "12px",
},
coinAmount: {
fontSize: "28px",
color: "#4ade80",
},
coinLabel: {
fontSize: "10px",
color: "#b9d9c8",
letterSpacing: "1px",
},
card: {
background: "var(--app-card, #101d30)",
border: "1px solid var(--app-border, #263850)",
borderRadius: "18px",
padding: "22px",
marginBottom: "20px",
boxSizing: "border-box",
boxShadow: "var(--app-shadow, none)",
},
stepBadge: {
display: "inline-block",
background: "#123a29",
color: "#4ade80",
border: "1px solid #26784d",
borderRadius: "20px",
padding: "6px 10px",
fontSize: "11px",
fontWeight: "bold",
letterSpacing: "1px",
marginBottom: "12px",
},
sectionTitle: {
fontSize: "20px",
margin: "0 0 20px",
},
subheading: {
fontSize: "16px",
margin: "24px 0 12px",
color: "#4ade80",
},
label: {
display: "block",
fontSize: "13px",
fontWeight: "bold",
margin: "15px 0 8px",
color: "var(--app-text, #dce5f0)",
},
input: {
width: "100%",
padding: "13px",
background: "var(--app-input, #081525)",
color: "var(--app-text, #f8fafc)",
border: "1px solid var(--app-border, #34465e)",
borderRadius: "10px",
outline: "none",
boxSizing: "border-box",
fontSize: "14px",
},
notice: {
background: "var(--app-secondary, #142a40)",
border: "1px solid var(--app-border, #284966)",
borderRadius: "10px",
padding: "12px",
color: "var(--app-text, #c7ddf3)",
fontSize: "13px",
lineHeight: 1.7,
marginTop: "14px",
},
criteriaCard: {
display: "grid",
gridTemplateColumns: "1fr",
gap: "8px",
background: "var(--app-secondary, #142a40)",
border: "1px solid var(--app-border, #284966)",
borderRadius: "12px",
padding: "16px",
},
criteriaValue: {
fontSize: "16px",
marginBottom: "10px",
overflowWrap: "anywhere",
},
minimumValue: {
fontSize: "25px",
color: "#4ade80",
marginBottom: "10px",
},
trxCard: {
background: "var(--app-secondary, #142a40)",
border: "1px solid var(--app-border, #284966)",
borderRadius: "12px",
padding: "16px",
marginTop: "12px",
lineHeight: 1.6,
},
trxIcon: {
width: "42px",
height: "42px",
borderRadius: "50%",
background: "#ef4444",
color: "#fff",
display: "flex",
alignItems: "center",
justifyContent: "center",
fontSize: "25px",
fontWeight: "bold",
marginBottom: "12px",
},
trxDescription: {
color: "var(--app-muted, #aab8ca)",
fontSize: "13px",
lineHeight: 1.7,
marginBottom: 0,
},
warning: {
background: "#302515",
border: "1px solid #785521",
borderRadius: "10px",
padding: "13px",
color: "#f5d8a3",
fontSize: "12px",
lineHeight: 1.7,
marginTop: "20px",
},
maxButton: {
marginTop: "9px",
background: "transparent",
color: "#4ade80",
border: "1px solid #26784d",
borderRadius: "8px",
padding: "8px 12px",
cursor: "pointer",
},
submitButton: {
width: "100%",
background: "#16a34a",
color: "#fff",
fontSize: "15px",
fontWeight: "bold",
border: "none",
borderRadius: "10px",
padding: "15px",
marginTop: "20px",
cursor: "pointer",
},
success: {
padding: "13px",
marginBottom: "16px",
borderRadius: "10px",
background: "#123a29",
border: "1px solid #258653",
color: "#bbf7d0",
lineHeight: 1.6,
},
error: {
padding: "13px",
marginBottom: "16px",
borderRadius: "10px",
background: "#3b171c",
border: "1px solid #8f303a",
color: "#fecaca",
lineHeight: 1.6,
},
muted: {
color: "var(--app-muted, #aab8ca)",
lineHeight: 1.6,
},
historyList: {
display: "flex",
flexDirection: "column",
gap: "12px",
},
historyItem: {
display: "flex",
alignItems: "center",
justifyContent: "space-between",
gap: "12px",
padding: "14px",
borderRadius: "12px",
background: "var(--app-secondary, #0a1728)",
border: "1px solid var(--app-border, #263850)",
overflowWrap: "anywhere",
},
historyDetails: {
color: "var(--app-muted, #c0ccdc)",
fontSize: "12px",
marginTop: "6px",
overflowWrap: "anywhere",
},
historyDate: {
color: "var(--app-muted, #8293a9)",
fontSize: "11px",
marginTop: "5px",
},
status: {
padding: "6px 9px",
borderRadius: "20px",
fontSize: "11px",
textTransform: "capitalize",
whiteSpace: "nowrap",
},
statusPending: {
color: "#fde68a",
background: "#493817",
},
statusApproved: {
color: "#bfdbfe",
background: "#193b62",
},
statusPaid: {
color: "#bbf7d0",
background: "#16452e",
},
statusRejected: {
color: "#fecaca",
background: "#4b2027",
},
footer: {
textAlign: "center",
color: "var(--app-muted, #718198)",
fontSize: "12px",
padding: "12px",
},
};