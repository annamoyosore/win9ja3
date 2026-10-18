import { useEffect, useState } from "react";
import {
account,
databases,
DATABASE_ID,
WALLET_COLLECTION,
DEPOSIT_COLLECTION,
APP_SETTINGS_COLLECTION,
ID,
Query,
} from "../lib/appwrite";

const COIN_PACKAGES = [
{ coins: 500, price: 750, currency: "NGN" },
{ coins: 1000, price: 1500, currency: "NGN" },
{ coins: 2500, price: 3750, currency: "NGN" },
{ coins: 5000, price: 7500, currency: "NGN" },
];

const INTERNATIONAL_PACKAGES = [
{ coins: 1000, price: 1, currency: "USD" },
{ coins: 2500, price: 2.5, currency: "USD" },
{ coins: 5000, price: 5, currency: "USD" },
{ coins: 10000, price: 10, currency: "USD" },
];

export default function CoinsStore() {
const [user, setUser] = useState(null);
const [wallet, setWallet] = useState(null);
const [trxAddress, setTrxAddress] = useState("");
const [selectedPackage, setSelectedPackage] = useState(null);
const [paymentMethod, setPaymentMethod] = useState("TRX");
const [transactionReference, setTransactionReference] = useState("");
const [amountPaid, setAmountPaid] = useState("");
const [loading, setLoading] = useState(true);
const [submitting, setSubmitting] = useState(false);
const [notification, setNotification] = useState({
message: "",
type: "",
});

const [country, setCountry] = useState(() => {
try {
return localStorage.getItem("win9ja_country") || "NG";
} catch {
return "NG";
}
});

const currency = country === "NG" ? "NGN" : "USD";

const packages =
country === "NG" ? COIN_PACKAGES : INTERNATIONAL_PACKAGES;

const formatMoney = (amount, code = currency) =>
new Intl.NumberFormat("en", {
style: "currency",
currency: code,
maximumFractionDigits: 2,
}).format(Number(amount) || 0);

// Notification with optional sound.
const notify = (message, type = "error") => {
setNotification({ message, type });

try {
  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (AudioContextClass) {
    const audio = new AudioContextClass();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.frequency.value = type === "success" ? 880 : 440;
    gain.gain.value = 0.06;

    oscillator.start();
    oscillator.stop(audio.currentTime + 0.15);
    oscillator.onended = () => audio.close();
  }
} catch {
  // The visible notification still works if audio is unavailable.
}

window.setTimeout(() => {
  setNotification({ message: "", type: "" });
}, 5000);

};

// Load user, wallet, and public TRON address.
useEffect(() => {
let active = true;

async function loadStore() {
  setLoading(true);

  try {
    const currentUser = await account.get();

    if (!active) return;
    setUser(currentUser);

    const walletResult = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", currentUser.$id),
        Query.limit(1),
      ]
    );

    if (!active) return;
    setWallet(walletResult.documents[0] || null);

    const settingsResult = await databases.listDocuments(
      DATABASE_ID,
      APP_SETTINGS_COLLECTION,
      [
        Query.equal("settingKey", "trx_address"),
        Query.limit(1),
      ]
    );

    if (!active) return;

    setTrxAddress(
      settingsResult.documents[0]?.settingValue || ""
    );
  } catch (error) {
    console.error("Coins store loading error:", error);

    if (active) {
      notify(
        "Unable to load your store. Check your sign-in and Appwrite permissions."
      );
    }
  } finally {
    if (active) setLoading(false);
  }
}

loadStore();

return () => {
  active = false;
};

}, []);

const refreshWallet = async () => {
if (!user) {
notify("Please sign in first.");
return;
}

try {
  const result = await databases.listDocuments(
    DATABASE_ID,
    WALLET_COLLECTION,
    [
      Query.equal("userId", user.$id),
      Query.limit(1),
    ]
  );

  setWallet(result.documents[0] || null);
  notify("Wallet refreshed.", "success");
} catch (error) {
  console.error("Wallet refresh error:", error);
  notify("Could not refresh your wallet.");
}

};

const selectPackage = (item) => {
setSelectedPackage(item);
setAmountPaid(String(item.price));
setTransactionReference("");
setNotification({ message: "", type: "" });
};

const submitDepositRequest = async (event) => {
event.preventDefault();

if (!user) {
  notify("Please sign in to purchase coins.");
  return;
}

if (!wallet) {
  notify("Your wallet was not found. Please contact support.");
  return;
}

if (!selectedPackage) {
  notify("Select a coin package first.");
  return;
}

if (paymentMethod === "TRX" && !trxAddress) {
  notify("The TRON receiving address has not been configured.");
  return;
}

if (!transactionReference.trim()) {
  notify("Enter your transaction reference or transaction ID.");
  return;
}

const numericAmount = Number(amountPaid);

if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
  notify("Enter a valid payment amount.");
  return;
}

setSubmitting(true);

try {
  /*
   * This creates a pending deposit request only.
   * It does not credit coins automatically.
   *
   * Confirm that these attribute names exist in your
   * existing deposit_requests collection before deployment.
   */
  await databases.createDocument(
    DATABASE_ID,
    DEPOSIT_COLLECTION,
    ID.unique(),
    {
      userId: user.$id,
      walletId: wallet.$id,
      amount: numericAmount,
      currency,
      coins: selectedPackage.coins,
      paymentMethod,
      transactionReference: transactionReference.trim(),
      status: "pending",
    }
  );

  notify(
    "Deposit request submitted. Coins will be credited after payment verification.",
    "success"
  );

  setSelectedPackage(null);
  setTransactionReference("");
  setAmountPaid("");
} catch (error) {
  console.error("Deposit request error:", error);

  notify(
    error?.message ||
      "Your request failed. Check the deposit collection attributes and permissions."
  );
} finally {
  setSubmitting(false);
}

};

const availableCoins = Number(
wallet?.balance ?? wallet?.coins ?? wallet?.coinBalance ?? 0
);

const lockedCoins = Number(
wallet?.lockedBalance ?? wallet?.lockedCoins ?? wallet?.locked ?? 0
);

if (loading) {
return (
<div style={styles.page}>
<div style={styles.loading}>Loading Win9ja Life Coins Store...</div>
</div>
);
}

if (!user) {
return (
<div style={styles.page}>
<div style={styles.messageCard}>
<h2>🔐 Sign-in required</h2>
<p>Please sign in to access your coin store.</p>
</div>
</div>
);
}

return (
<main style={styles.page}>
<div style={styles.container}>
<header style={styles.header}>
<div>
<h1 style={styles.title}>🪙 Win9ja Life</h1>
<p style={styles.subtitle}>Gold Coins Store</p>
</div>

      <select
        aria-label="Select country"
        value={country}
        onChange={(event) => {
          const value = event.target.value;

          setCountry(value);

          try {
            localStorage.setItem("win9ja_country", value);
          } catch {
            // Country selection still works for this session.
          }

          setSelectedPackage(null);
        }}
        style={styles.countrySelect}
      >
        <option value="NG">🇳🇬 Nigeria · NGN</option>
        <option value="US">🇺🇸 United States · USD</option>
        <option value="GB">🇬🇧 United Kingdom · USD pricing</option>
        <option value="CA">🇨🇦 Canada · USD pricing</option>
        <option value="GH">🇬🇭 Ghana · USD pricing</option>
        <option value="KE">🇰🇪 Kenya · USD pricing</option>
        <option value="ZA">🇿🇦 South Africa · USD pricing</option>
        <option value="IN">🇮🇳 India · USD pricing</option>
      </select>
    </header>

    {notification.message && (
      <div
        role="alert"
        aria-live="polite"
        style={{
          ...styles.notification,
          ...(notification.type === "success"
            ? styles.success
            : styles.error),
        }}
      >
        {notification.type === "success" ? "✅ " : "⚠️ "}
        {notification.message}
      </div>
    )}

    <section style={styles.walletCard}>
      <div>
        <p style={styles.walletLabel}>Available Coins</p>
        <h2 style={styles.balance}>
          🪙 {availableCoins.toLocaleString()}
        </h2>
      </div>

      <div>
        <p style={styles.walletLabel}>Locked Coins</p>
        <h2 style={styles.lockedBalance}>
          🔒 {lockedCoins.toLocaleString()}
        </h2>
      </div>

      <button
        type="button"
        onClick={refreshWallet}
        style={styles.refreshButton}
      >
        ↻ Refresh
      </button>
    </section>

    <section>
      <h2 style={styles.sectionTitle}>Choose Your Coin Package</h2>
      <p style={styles.description}>
        Select a package to start your purchase.
      </p>

      <div style={styles.packageGrid}>
        {packages.map((item) => {
          const selected =
            selectedPackage?.coins === item.coins;

          return (
            <button
              type="button"
              key={`${item.currency}-${item.coins}`}
              onClick={() => selectPackage(item)}
              aria-pressed={selected}
              style={{
                ...styles.packageCard,
                ...(selected ? styles.selectedPackage : {}),
              }}
            >
              <div style={styles.coinArt} aria-hidden="true">
                <span style={styles.coinOuter}>
                  <span style={styles.coinInner}>W</span>
                </span>
                <span style={styles.coinSmall}>🪙</span>
              </div>

              <h3 style={styles.packageCoins}>
                {item.coins.toLocaleString()}
              </h3>

              <p style={styles.packageLabel}>Gold W Coins</p>

              <strong style={styles.packagePrice}>
                {formatMoney(item.price, item.currency)}
              </strong>

              {selected && (
                <span style={styles.selectedLabel}>✓ Selected</span>
              )}
            </button>
          );
        })}
      </div>
    </section>

    {selectedPackage && (
      <section style={styles.paymentCard}>
        <h2 style={styles.sectionTitle}>Complete Your Request</h2>

        <div style={styles.orderSummary}>
          <span>Selected coins</span>
          <strong>
            {selectedPackage.coins.toLocaleString()} W Coins
          </strong>
        </div>

        <div style={styles.orderSummary}>
          <span>Package price</span>
          <strong>
            {formatMoney(
              selectedPackage.price,
              selectedPackage.currency
            )}
          </strong>
        </div>

        <form onSubmit={submitDepositRequest}>
          <label style={styles.label} htmlFor="paymentMethod">
            Payment Method
          </label>

          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(event.target.value)
            }
            style={styles.input}
          >
            <option value="TRX">TRON (TRX / TRC20)</option>
            <option value="Flutterwave">Flutterwave</option>
          </select>

          {paymentMethod === "TRX" && (
            <div style={styles.trxBox}>
              <h3 style={styles.trxTitle}>
                TRON Receiving Address
              </h3>

              {trxAddress ? (
                <>
                  <p style={styles.trxAddress}>{trxAddress}</p>

                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(trxAddress);
                        notify("TRON address copied.", "success");
                      } catch {
                        notify(
                          "Copy failed. Please copy the address manually."
                        );
                      }
                    }}
                  >
                    📋 Copy Address
                  </button>

                  <p style={styles.helpText}>
                    Check the receiving address and network carefully
                    before transferring funds.
                  </p>
                </>
              ) : (
                <p style={styles.helpText}>
                  The receiving address is not configured. Please
                  contact support.
                </p>
              )}
            </div>
          )}

          {paymentMethod === "Flutterwave" && (
            <div style={styles.trxBox}>
              <h3 style={styles.trxTitle}>Flutterwave</h3>
              <p style={styles.helpText}>
                Flutterwave checkout is not connected by this form.
                Do not make a payment until a verified checkout
                integration is available.
              </p>
            </div>
          )}

          <label style={styles.label} htmlFor="amountPaid">
            Amount Paid ({currency})
          </label>

          <input
            id="amountPaid"
            type="number"
            min="0.01"
            step="0.01"
            value={amountPaid}
            onChange={(event) => setAmountPaid(event.target.value)}
            style={styles.input}
            required
          />

          <label style={styles.label} htmlFor="transactionReference">
            Transaction Reference / ID
          </label>

          <input
            id="transactionReference"
            type="text"
            value={transactionReference}
            onChange={(event) =>
              setTransactionReference(event.target.value)
            }
            placeholder="Enter your transaction ID"
            style={styles.input}
            required
          />

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...styles.primaryButton,
              ...(submitting ? styles.disabledButton : {}),
            }}
          >
            {submitting
              ? "Submitting..."
              : "Submit Deposit for Verification"}
          </button>

          <p style={styles.helpText}>
            Your request remains pending until the payment is verified.
            Submitting a reference does not itself prove payment.
          </p>
        </form>
      </section>
    )}

    <footer style={styles.footer}>
      Win9ja Life · Gold Coins
    </footer>
  </div>
</main>

);
}

const styles = {
page: {
minHeight: "100vh",
boxSizing: "border-box",
padding: "20px 12px",
background: "#07130d",
color: "#f3f4f6",
fontFamily: "Arial, sans-serif",
},
container: {
width: "100%",
maxWidth: "900px",
margin: "0 auto",
},
loading: {
textAlign: "center",
padding: "60px 10px",
},
header: {
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: "12px",
flexWrap: "wrap",
marginBottom: "25px",
},
title: {
color: "#4ade80",
fontSize: "27px",
margin: "0 0 6px",
},
subtitle: {
color: "#a7b6ac",
margin: 0,
},
countrySelect: {
maxWidth: "100%",
padding: "11px",
background: "#14251a",
color: "#fff",
border: "1px solid #365541",
borderRadius: "9px",
},
notification: {
padding: "14px",
borderRadius: "10px",
marginBottom: "18px",
lineHeight: 1.5,
},
success: {
background: "#123b24",
border: "1px solid #22c55e",
},
error: {
background: "#451a1a",
border: "1px solid #ef4444",
},
messageCard: {
maxWidth: "500px",
margin: "50px auto",
padding: "25px",
background: "#102017",
borderRadius: "14px",
},
walletCard: {
display: "flex",
flexWrap: "wrap",
justifyContent: "space-between",
alignItems: "center",
gap: "18px",
background: "linear-gradient(135deg, #14532d, #166534)",
border: "1px solid #398650",
padding: "22px",
borderRadius: "17px",
marginBottom: "30px",
},
walletLabel: {
color: "#d1fae5",
margin: "0 0 8px",
},
balance: {
color: "#fde68a",
fontSize: "28px",
margin: 0,
},
lockedBalance: {
fontSize: "24px",
margin: 0,
},
refreshButton: {
background: "#f0fdf4",
color: "#166534",
border: 0,
borderRadius: "8px",
padding: "10px 14px",
cursor: "pointer",
fontWeight: "bold",
},
sectionTitle: {
fontSize: "21px",
margin: "0 0 10px",
},
description: {
color: "#a7b6ac",
marginBottom: "20px",
},
packageGrid: {
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
gap: "13px",
},
packageCard: {
position: "relative",
textAlign: "center",
background: "#102017",
border: "1px solid #294634",
borderRadius: "14px",
padding: "18px 10px",
color: "#fff",
cursor: "pointer",
minWidth: 0,
},
selectedPackage: {
border: "2px solid #4ade80",
background: "#153522",
},
coinArt: {
position: "relative",
display: "flex",
justifyContent: "center",
alignItems: "center",
minHeight: "52px",
},
coinOuter: {
display: "flex",
justifyContent: "center",
alignItems: "center",
width: "48px",
height: "48px",
borderRadius: "50%",
background: "linear-gradient(145deg, #fff0a6, #eab308, #a16207)",
border: "3px solid #fde68a",
boxShadow: "0 3px 12px #0008",
},
coinInner: {
display: "flex",
justifyContent: "center",
alignItems: "center",
width: "33px",
height: "33px",
borderRadius: "50%",
border: "2px solid #a16207",
color: "#713f12",
fontSize: "21px",
fontWeight: "900",
},
coinSmall: {
position: "absolute",
marginLeft: "45px",
marginTop: "25px",
fontSize: "20px",
},
packageCoins: {
fontSize: "23px",
color: "#facc15",
margin: "12px 0 5px",
},
packageLabel: {
color: "#a7b6ac",
fontSize: "13px",
margin: "0 0 12px",
},
packagePrice: {
color: "#4ade80",
fontSize: "17px",
},
selectedLabel: {
display: "block",
color: "#4ade80",
fontSize: "12px",
marginTop: "10px",
},
paymentCard: {
background: "#102017",
border: "1px solid #294634",
borderRadius: "15px",
padding: "20px",
marginTop: "28px",
},
orderSummary: {
display: "flex",
justifyContent: "space-between",
gap: "12px",
padding: "12px 0",
borderBottom: "1px solid #294634",
},
label: {
display: "block",
margin: "18px 0 8px",
fontSize: "14px",
color: "#d1fae5",
},
input: {
display: "block",
width: "100%",
boxSizing: "border-box",
padding: "13px",
borderRadius: "9px",
background: "#07130d",
color: "#fff",
border: "1px solid #365541",
fontSize: "15px",
},
trxBox: {
marginTop: "17px",
padding: "15px",
borderRadius: "10px",
background: "#07130d",
border: "1px solid #365541",
overflowWrap: "anywhere",
},
trxTitle: {
marginTop: 0,
color: "#4ade80",
},
trxAddress: {
padding: "12px",
background: "#14251a",
borderRadius: "7px",
overflowWrap: "anywhere",
fontSize: "14px",
},
secondaryButton: {
width: "100%",
padding: "11px",
border: "1px solid #4ade80",
borderRadius: "8px",
background: "transparent",
color: "#4ade80",
cursor: "pointer",
},
primaryButton: {
width: "100%",
marginTop: "22px",
padding: "15px",
background: "#16a34a",
color: "#fff",
fontWeight: "bold",
border: 0,
borderRadius: "9px",
cursor: "pointer",
},
disabledButton: {
opacity: 0.6,
cursor: "not-allowed",
},
helpText: {
color: "#a7b6ac",
fontSize: "13px",
lineHeight: 1.6,
marginTop: "12px",
},
footer: {
textAlign: "center",
color: "#829488",
fontSize: "12px",
marginTop: "35px",
padding: "20px 0",
},
};