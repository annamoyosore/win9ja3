import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  PROMO_COLLECTION,
  DEPOSIT_COLLECTION,
  WITHDRAW_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

import { getWallet } from "../lib/wallet";

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
    maxWidth: "760px",
    margin: "0 auto"
  },

  card: {
    background: "#101e31",
    border: "1px solid #263951",
    borderRadius: "14px",
    padding: "18px",
    marginTop: "16px"
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

  dangerButton: {
    width: "100%",
    padding: "12px",
    marginTop: "10px",
    background: "#b91c1c",
    color: "#ffffff",
    border: "none",
    borderRadius: "9px",
    cursor: "pointer"
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

  muted: {
    color: "#a6b7cc",
    fontSize: "13px",
    lineHeight: 1.6
  },

  modal: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    padding: "16px",
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflowY: "auto"
  },

  modalCard: {
    background: "#101e31",
    border: "1px solid #344861",
    borderRadius: "14px",
    padding: "20px",
    width: "100%",
    maxWidth: "460px",
    maxHeight: "90vh",
    overflowY: "auto",
    boxSizing: "border-box"
  }
};

// =====================================
// HELPER
// =====================================

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

// =====================================
// WALLET COMPONENT
// =====================================

export default function Wallet() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  const [wallet, setWallet] = useState(null);

  const [loading, setLoading] = useState(true);

  const [promo, setPromo] = useState(null);

  const [zangiContact, setZangiContact] = useState("");

  const [message, setMessage] = useState("");

  // Game-fund deposit modal
  const [showDeposit, setShowDeposit] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");

  const [depositName, setDepositName] = useState("");

  const [depositLoading, setDepositLoading] = useState(false);

  // Coin withdrawal modal
  const [showWithdraw, setShowWithdraw] = useState(false);

  const [withdrawCoins, setWithdrawCoins] = useState("");

  const [bank, setBank] = useState("");

  const [accountNumber, setAccountNumber] = useState("");

  const [accountName, setAccountName] = useState("");

  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // =====================================
  // LOAD USER AND WALLET
  // =====================================

  useEffect(() => {
    loadWallet();
  }, []);

  async function loadWallet() {
    setLoading(true);
    setMessage("");

    try {
      const currentUser = await account.get();

      setUser(currentUser);

      const currentWallet = await getWallet(currentUser.$id);

      setWallet(currentWallet);

      setZangiContact(currentWallet.zangiContact || "");

      // Load the user's promo code.
      const promoResponse = await databases.listDocuments(
        DATABASE_ID,
        PROMO_COLLECTION,
        [
          Query.equal("ownerId", currentUser.$id),
          Query.limit(1)
        ]
      );

      if (promoResponse.documents.length > 0) {
        setPromo(promoResponse.documents[0]);
      }
    } catch (error) {
      console.error("Wallet loading failed:", error);

      setMessage(
        "Unable to load your wallet. Please sign in and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================
  // CREATE PROMO CODE
  // =====================================

  function generateCode(displayName) {
    const base = (
      displayName ||
      wallet?.name ||
      "USER"
    )
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 5);

    return base + Math.floor(1000 + Math.random() * 9000);
  }

  async function createPromo() {
    try {
      if (!user) {
        alert("Please sign in first.");
        return;
      }

      if (promo?.code) {
        alert("You already have a promo code.");
        return;
      }

      const code = generateCode(wallet?.name);

      const newPromo = await databases.createDocument(
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

      setPromo(newPromo);

      alert("Promo code created successfully.");
    } catch (error) {
      console.error("Promo creation failed:", error);

      alert(
        `Could not create promo code: ${
          error.message || "Please try again."
        }`
      );
    }
  }

  // =====================================
  // COPY TEXT
  // =====================================

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);

      alert(`${label} copied successfully.`);
    } catch {
      alert(
        "Copy failed. Please select and copy the text manually."
      );
    }
  }

  function copyPromoCode() {
    if (!promo?.code) {
      alert("Create a promo code first.");
      return;
    }

    copyText(promo.code, "Promo code");
  }

  function copyInvite() {
    if (!promo?.code) {
      alert("Create a promo code first.");
      return;
    }

    const inviteText = `
🎮 Join Win9ja Life!

Use Promo Code: ${promo.code}

🪙 Play and earn rewards.

Visit:
https://win9jalife.vercel.app

📲 Community Group:
https://chat.whatsapp.com/XXXXXXXX
    `.trim();

    copyText(inviteText, "Invitation");
  }

  // =====================================
  // SAVE ZANGI CONTACT
  // =====================================

  async function saveZangi() {
    try {
      if (!wallet?.$id) {
        alert("Wallet not found.");
        return;
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          zangiContact: zangiContact.trim()
        }
      );

      alert("Zangi contact saved successfully.");

      await loadWallet();
    } catch (error) {
      alert(
        `Could not save Zangi contact: ${error.message}`
      );
    }
  }

  // =====================================
  // EXISTING GAME-FUND DEPOSIT
  //
  // This remains separate from coin purchases.
  // =====================================

  async function makeDeposit() {
    if (depositLoading) return;

    if (!depositAmount || Number(depositAmount) < 200) {
      alert("Minimum game-fund deposit is ₦200.");
      return;
    }

    if (!depositName.trim()) {
      alert("Enter your full name.");
      return;
    }

    setDepositLoading(true);

    try {
      const currentUser = await account.get();

      const reference = `DEP-${Date.now()}`;

      await databases.createDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        ID.unique(),
        {
          userId: currentUser.$id,
          amount: Number(depositAmount),
          name: depositName.trim(),
          status: "pending",
          reference,
          createdAt: new Date().toISOString()
        }
      );

      window.open(
        "https://flutterwave.com/pay/qiattof2hy2w",
        "_blank",
        "noopener,noreferrer"
      );

      alert(
        "Deposit request created. The payment must be verified before funds are credited."
      );

      setShowDeposit(false);
      setDepositAmount("");
      setDepositName("");
    } catch (error) {
      console.error("Game deposit failed:", error);

      alert(
        `Deposit failed: ${error.message}`
      );
    } finally {
      setDepositLoading(false);
    }
  }

  // =====================================
  // REQUEST COIN WITHDRAWAL
  //
  // Nigeria: local bank details.
  // Ghana and international TRX withdrawals
  // need additional configuration before use.
  //
  // Coins are NOT deducted at request time.
  // =====================================

  async function requestWithdraw() {
    if (withdrawLoading) return;

    const coins = Number(withdrawCoins);

    if (!Number.isInteger(coins) || coins <= 0) {
      alert("Enter a valid whole number of coins.");
      return;
    }

    const country = String(
      wallet?.country ||
      wallet?.countryCode ||
      "NG"
    ).toUpperCase();

    const isNigeria =
      country === "NG" ||
      country === "NIGERIA";

    const isGhana =
      country === "GH" ||
      country === "GHANA";

    const minimum = isNigeria || isGhana ? 2000 : 5000;

    if (coins < minimum) {
      alert(
        `Minimum withdrawal is ${minimum.toLocaleString()} coins.`
      );
      return;
    }

    if (coins > Number(wallet?.coins || 0)) {
      alert("Insufficient coin balance.");
      return;
    }

    // International withdrawals require a configured TRX form
    // and corresponding Appwrite attributes.
    if (!isNigeria) {
      alert(
        "International TRX withdrawals will be enabled after the TRX address and withdrawal collection are configured."
      );

      return;
    }

    if (!bank.trim()) {
      alert("Enter your bank name.");
      return;
    }

    if (!/^\d{10}$/.test(accountNumber.trim())) {
      alert("Enter a valid 10-digit Nigerian bank account number.");
      return;
    }

    if (!accountName.trim()) {
      alert("Enter the account holder's name.");
      return;
    }

    setWithdrawLoading(true);

    try {
      const currentUser = await account.get();

      await databases.createDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        ID.unique(),
        {
          userId: currentUser.$id,

          // This field stores the requested coin count
          // for compatibility with the existing schema.
          amount: coins,

          bank: bank.trim(),

          accountNumber: accountNumber.trim(),

          accountName: accountName.trim(),

          status: "pending",

          createdAt: new Date().toISOString()
        }
      );

      alert(
        "Your withdrawal request has been submitted. Your coins remain in your wallet until the request is paid."
      );

      setShowWithdraw(false);

      setWithdrawCoins("");
      setBank("");
      setAccountNumber("");
      setAccountName("");
    } catch (error) {
      console.error("Withdrawal request failed:", error);

      alert(
        `Withdrawal request failed: ${error.message}. Please check the withdrawal_requests collection attributes in Appwrite.`
      );
    } finally {
      setWithdrawLoading(false);
    }
  }

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <h2>💳 Win9ja Wallet</h2>
          <p>Loading your wallet...</p>
        </div>
      </main>
    );
  }

  // =====================================
  // LOGIN ERROR
  // =====================================

  if (!user || !wallet) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <h2>💳 Win9ja Wallet</h2>

          <p>{message || "Please sign in to view your wallet."}</p>

          <button
            style={styles.button}
            onClick={() => navigate("/login")}
          >
            Sign in
          </button>

          <button
            style={styles.secondaryButton}
            onClick={() => navigate("/")}
          >
            Home
          </button>
        </div>
      </main>
    );
  }

  // =====================================
  // MAIN WALLET UI
  // =====================================

  return (
    <main style={styles.page}>
      <div style={styles.container}>

        <header>
          <h1>💳 My Wallet</h1>

          <p style={styles.muted}>
            Welcome, {wallet.name || user.name || "Player"}
          </p>
        </header>

        {message && (
          <div style={styles.card}>
            {message}
          </div>
        )}

        {/* GAME BALANCE */}

        <section style={styles.card}>
          <h2>💰 Game Funds</h2>

          <p style={{ fontSize: 27, fontWeight: "bold" }}>
            {formatNaira(wallet.balance)}
          </p>

          <p style={styles.muted}>
            Funds used for your existing games.
          </p>

          <p>
            🔒 Locked game funds:{" "}
            {formatNaira(wallet.locked ?? wallet.lockedCoins ?? 0)}
          </p>

          <button
            style={styles.button}
            onClick={() => setShowDeposit(true)}
          >
            ➕ Deposit Game Funds
          </button>
        </section>

        {/* COIN BALANCE */}

        <section
          style={{
            ...styles.card,
            border: "1px solid #16a34a"
          }}
        >
          <h2>🪙 Win9ja Coins</h2>

          <p
            style={{
              fontSize: 32,
              fontWeight: "bold",
              color: "#4ade80"
            }}
          >
            {Number(wallet.coins || 0).toLocaleString()}
          </p>

          <p style={styles.muted}>
            Your coin balance is separate from your game funds.
          </p>

          <button
            style={styles.button}
            onClick={() => navigate("/coins")}
          >
            🪙 Buy Coins
          </button>

          <button
            style={styles.secondaryButton}
            onClick={() => setShowWithdraw(true)}
          >
            💸 Withdraw Coins
          </button>
        </section>

        {/* PROMO CODES */}

        <section style={styles.card}>
          <h2>🎁 Promo Code</h2>

          {promo?.code ? (
            <>
              <p style={{ fontSize: 23, color: "#4ade80" }}>
                {promo.code}
              </p>

              <p style={styles.muted}>
                Users joined: {promo.usedCount || 0}
              </p>

              <button
                style={styles.button}
                onClick={copyPromoCode}
              >
                📋 Copy Promo Code
              </button>

              <button
                style={styles.secondaryButton}
                onClick={copyInvite}
              >
                📤 Copy Invitation
              </button>
            </>
          ) : (
            <>
              <p style={styles.muted}>
                Create a promo code to share your Win9ja Life invitation.
              </p>

              <button
                style={styles.button}
                onClick={createPromo}
              >
                + Create Promo Code
              </button>
            </>
          )}
        </section>

        {/* ZANGI */}

        <section style={styles.card}>
          <h2>💬 Zangi Contact</h2>

          <input
            style={styles.input}
            value={zangiContact}
            onChange={event =>
              setZangiContact(event.target.value)
            }
            placeholder="Enter your Zangi contact"
          />

          <button
            style={styles.button}
            onClick={saveZangi}
          >
            Save Zangi Contact
          </button>
        </section>

        {/* NAVIGATION */}

        <section style={styles.card}>
          <button
            style={styles.secondaryButton}
            onClick={() => navigate("/dashboard")}
          >
            ← Back to Dashboard
          </button>
        </section>

        {/* GAME-FUND DEPOSIT MODAL */}

        {showDeposit && (
          <div style={styles.modal}>
            <div style={styles.modalCard}>
              <h2>➕ Deposit Game Funds</h2>

              <p style={styles.muted}>
                This form is for game funds, not coin purchases.
              </p>

              <label>Full name</label>

              <input
                style={styles.input}
                value={depositName}
                onChange={event =>
                  setDepositName(event.target.value)
                }
                placeholder="Enter full name"
              />

              <label>Amount in naira</label>

              <input
                style={styles.input}
                type="number"
                min="200"
                value={depositAmount}
                onChange={event =>
                  setDepositAmount(event.target.value)
                }
                placeholder="Minimum ₦200"
              />

              <button
                style={styles.button}
                disabled={depositLoading}
                onClick={makeDeposit}
              >
                {depositLoading
                  ? "Processing..."
                  : "Proceed to Payment"}
              </button>

              <button
                style={styles.dangerButton}
                onClick={() => setShowDeposit(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* COIN WITHDRAWAL MODAL */}

        {showWithdraw && (
          <div style={styles.modal}>
            <div style={styles.modalCard}>
              <h2>💸 Withdraw Coins</h2>

              <p>
                Available coins:{" "}
                <strong>
                  {Number(wallet.coins || 0).toLocaleString()}
                </strong>
              </p>

              <p style={styles.muted}>
                Nigeria and Ghana: minimum 2,000 coins.
                Other countries: minimum 5,000 coins.
              </p>

              <label>Number of coins</label>

              <input
                style={styles.input}
                type="number"
                min="2000"
                step="1"
                value={withdrawCoins}
                onChange={event =>
                  setWithdrawCoins(event.target.value)
                }
                placeholder="Enter coins to withdraw"
              />

              <h3>🇳🇬 Nigerian Bank Details</h3>

              <label>Bank name</label>

              <input
                style={styles.input}
                value={bank}
                onChange={event =>
                  setBank(event.target.value)
                }
                placeholder="Enter bank name"
              />

              <label>Account number</label>

              <input
                style={styles.input}
                inputMode="numeric"
                maxLength={10}
                value={accountNumber}
                onChange={event =>
                  setAccountNumber(
                    event.target.value.replace(/\D/g, "")
                  )
                }
                placeholder="10-digit account number"
              />

              <label>Account holder name</label>

              <input
                style={styles.input}
                value={accountName}
                onChange={event =>
                  setAccountName(event.target.value)
                }
                placeholder="Enter account holder name"
              />

              <button
                style={styles.button}
                disabled={withdrawLoading}
                onClick={requestWithdraw}
              >
                {withdrawLoading
                  ? "Submitting..."
                  : "Submit Withdrawal Request"}
              </button>

              <button
                style={styles.dangerButton}
                onClick={() => setShowWithdraw(false)}
              >
                Cancel
              </button>

              <p style={styles.muted}>
                Submitting a request does not automatically
                deduct your coins. The admin must review and
                process the payout.
              </p>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}