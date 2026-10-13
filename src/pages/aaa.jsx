import { useEffect, useState } from "react";

import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  MATCH_COLLECTION,
  CASINO_COLLECTION,
  DEPOSIT_COLLECTION,
  WITHDRAW_COLLECTION,
  Query,
} from "../lib/appwrite";

import { getWallet } from "../lib/wallet";

const ADMIN_ID = "69ef9fe863a02a7490b4";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#07111f",
    color: "#f8fafc",
    padding: "24px 14px",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    flexWrap: "wrap",
    marginBottom: "25px",
  },
  brand: {
    color: "#4ade80",
    fontWeight: "bold",
    letterSpacing: "2px",
    fontSize: "13px",
  },
  heading: {
    fontSize: "30px",
    margin: "8px 0",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "13px",
  },
  button: {
    padding: "10px 14px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "12px",
  },
  green: {
    background: "#16a34a",
    color: "#fff",
  },
  red: {
    background: "#991b1b",
    color: "#fff",
  },
  blue: {
    background: "#1d4ed8",
    color: "#fff",
  },
  gray: {
    background: "#334155",
    color: "#fff",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "14px",
    marginBottom: "25px",
  },
  stat: {
    background: "#101d30",
    border: "1px solid #263850",
    borderRadius: "14px",
    padding: "18px",
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: "12px",
  },
  statNumber: {
    display: "block",
    fontSize: "25px",
    marginTop: "9px",
    color: "#4ade80",
  },
  section: {
    background: "#101d30",
    border: "1px solid #263850",
    borderRadius: "15px",
    padding: "18px",
    marginBottom: "22px",
    overflowX: "auto",
  },
  sectionTitle: {
    fontSize: "19px",
    margin: "0 0 15px",
  },
  muted: {
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: 1.6,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "750px",
    fontSize: "12px",
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    color: "#94a3b8",
    borderBottom: "1px solid #334155",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "13px 10px",
    borderBottom: "1px solid #233247",
    verticalAlign: "top",
  },
  actions: {
    display: "flex",
    gap: "7px",
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: "20px",
    fontSize: "11px",
    background: "#334155",
    color: "#fff",
  },
  success: {
    padding: "12px",
    background: "#123a29",
    border: "1px solid #258653",
    color: "#bbf7d0",
    borderRadius: "9px",
    marginBottom: "15px",
    fontSize: "13px",
  },
  error: {
    padding: "12px",
    background: "#3b171c",
    border: "1px solid #8f303a",
    color: "#fecaca",
    borderRadius: "9px",
    marginBottom: "15px",
    fontSize: "13px",
  },
  warning: {
    padding: "12px",
    background: "#302515",
    border: "1px solid #785521",
    color: "#f5d8a3",
    borderRadius: "9px",
    marginBottom: "18px",
    fontSize: "12px",
    lineHeight: 1.6,
  },
};

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function money(value, currency = "NGN") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function statusStyle(status) {
  const normalized = String(status || "pending").toLowerCase();

  if (normalized === "approved") {
    return {
      background: "#193b62",
      color: "#bfdbfe",
    };
  }

  if (normalized === "paid" || normalized === "completed") {
    return {
      background: "#16452e",
      color: "#bbf7d0",
    };
  }

  if (normalized === "rejected" || normalized === "failed") {
    return {
      background: "#4b2027",
      color: "#fecaca",
    };
  }

  return {
    background: "#493817",
    color: "#fde68a",
  };
}

export default function Admin() {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [matches, setMatches] = useState([]);
  const [casinoRecords, setCasinoRecords] = useState([]);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    verifyAdmin();
  }, []);

  async function verifyAdmin() {
    try {
      const user = await account.get();

      if (user.$id !== ADMIN_ID) {
        setAuthorized(false);
        setError("Access denied. This account is not an administrator.");
        return;
      }

      setAuthorized(true);
      await refreshAll();
    } catch (err) {
      console.error(err);
      setError("Please sign in with the authorized admin account.");
    } finally {
      setChecking(false);
    }
  }

  async function safeList(collectionId, queries = []) {
    try {
      const result = await databases.listDocuments(
        DATABASE_ID,
        collectionId,
        [...queries, Query.limit(100)]
      );

      return result.documents;
    } catch (err) {
      console.error(`Unable to load ${collectionId}:`, err);
      return [];
    }
  }

  async function refreshAll() {
    setMessage("");
    setError("");

    const [
      depositRecords,
      withdrawalRecords,
      matchRecords,
      casino,
    ] = await Promise.all([
      safeList(DEPOSIT_COLLECTION, [
        Query.orderDesc("$createdAt"),
      ]),
      safeList(WITHDRAW_COLLECTION, [
        Query.orderDesc("$createdAt"),
      ]),
      safeList(MATCH_COLLECTION, [
        Query.orderDesc("$createdAt"),
      ]),
      safeList(CASINO_COLLECTION, [
        Query.orderDesc("$createdAt"),
      ]),
    ]);

    setDeposits(depositRecords);
    setWithdrawals(withdrawalRecords);
    setMatches(matchRecords);
    setCasinoRecords(casino);
  }

  function notifySuccess(text) {
    setError("");
    setMessage(text);
  }

  function notifyError(text) {
    setMessage("");
    setError(text);
  }

  /*
   * Approve a coin purchase.
   *
   * Important:
   * - Only documents with coins > 0 are treated as coin purchases.
   * - Existing game-fund deposits are not credited to coin balance.
   * - Check the real payment before pressing Approve.
   */
  async function approveCoinDeposit(deposit) {
    if (busy) return;

    const coins = Number(deposit.coins || 0);

    if (!Number.isSafeInteger(coins) || coins <= 0) {
      notifyError(
        "This is not a valid coin purchase request. It may be an older game-fund deposit."
      );
      return;
    }

    if (String(deposit.status || "").toLowerCase() !== "pending") {
      notifyError("This request is no longer pending.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm that you have verified the payment of ${deposit.amount} ${deposit.currency || ""} for ${coins} coins?`
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      /*
       * Re-read the request immediately before processing.
       * This reduces accidental duplicate processing but does not
       * provide atomic protection against concurrent administrators.
       */
      const latest = await databases.getDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        deposit.$id
      );

      if (String(latest.status || "").toLowerCase() !== "pending") {
        throw new Error("The request has already been processed.");
      }

      const latestCoins = Number(latest.coins || 0);

      if (!Number.isSafeInteger(latestCoins) || latestCoins <= 0) {
        throw new Error("This request has no valid coin quantity.");
      }

      const wallet = await getWallet(latest.userId);

      /*
       * Only the separate coins field is updated.
       * Game balance and locked funds remain unchanged.
       */
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          coins: Number(wallet.coins || 0) + latestCoins,
        }
      );

      /*
       * Record approval after updating the wallet.
       * For production use, move both operations into an atomic,
       * server-side Appwrite Function.
       */
      await databases.updateDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        latest.$id,
        {
          status: "approved",
        }
      );

      notifySuccess(
        `${latestCoins.toLocaleString()} coins credited to the user's coin balance.`
      );

      await refreshAll();
    } catch (err) {
      console.error("Coin deposit approval error:", err);

      notifyError(
        `Unable to approve this purchase: ${err.message || "Unknown error"}. Check the wallet and request status before trying again.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function rejectDeposit(deposit) {
    if (busy) return;

    if (String(deposit.status || "").toLowerCase() !== "pending") {
      notifyError("Only pending requests can be rejected.");
      return;
    }

    const confirmed = window.confirm(
      "Reject this payment request? Verify its payment status first."
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const latest = await databases.getDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        deposit.$id
      );

      if (String(latest.status || "").toLowerCase() !== "pending") {
        throw new Error("The request has already been processed.");
      }

      await databases.updateDocument(
        DATABASE_ID,
        DEPOSIT_COLLECTION,
        latest.$id,
        {
          status: "rejected",
        }
      );

      notifySuccess("Payment request rejected.");
      await refreshAll();
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Unable to reject the request.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * Approving a withdrawal does not deduct coins.
   * It only indicates that the request has been reviewed.
   */
  async function approveWithdrawal(request) {
    if (busy) return;

    if (String(request.status || "").toLowerCase() !== "pending") {
      notifyError("Only pending withdrawal requests can be approved.");
      return;
    }

    const confirmed = window.confirm(
      "Approve this withdrawal request? You must still send the payment and mark it paid afterward."
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const latest = await databases.getDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        request.$id
      );

      if (String(latest.status || "").toLowerCase() !== "pending") {
        throw new Error("The withdrawal has already been processed.");
      }

      await databases.updateDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        latest.$id,
        {
          status: "approved",
        }
      );

      notifySuccess(
        "Withdrawal approved. Send the payment manually before marking it paid."
      );

      await refreshAll();
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Unable to approve withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * Mark as paid only after the bank transfer or TRX payment
   * has actually been sent.
   *
   * This deducts coins from the user's coin balance.
   */
  async function markWithdrawalPaid(request) {
    if (busy) return;

    if (String(request.status || "").toLowerCase() !== "approved") {
      notifyError(
        "Approve the withdrawal first. Only approved requests can be marked paid."
      );
      return;
    }

    const coins = Number(request.coins ?? request.amount ?? 0);

    if (!Number.isSafeInteger(coins) || coins <= 0) {
      notifyError("The withdrawal has an invalid coin quantity.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm that you have ALREADY SENT payment for ${coins.toLocaleString()} coins? This will deduct the coins from the user's wallet.`
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const latest = await databases.getDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        request.$id
      );

      if (String(latest.status || "").toLowerCase() !== "approved") {
        throw new Error("This withdrawal is not approved.");
      }

      const latestCoins = Number(latest.coins ?? latest.amount ?? 0);

      if (!Number.isSafeInteger(latestCoins) || latestCoins <= 0) {
        throw new Error("The withdrawal coin quantity is invalid.");
      }

      const wallet = await getWallet(latest.userId);
      const availableCoins = Number(wallet.coins || 0);

      if (availableCoins < latestCoins) {
        throw new Error(
          "The user does not have enough coins to complete this withdrawal. Review the account before proceeding."
        );
      }

      /*
       * This is a client-side, two-document operation, not a
       * transaction. Production payment handling should be moved
       * into a server-side function with atomic safeguards.
       */
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          coins: availableCoins - latestCoins,
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        latest.$id,
        {
          status: "paid",
        }
      );

      notifySuccess(
        `Withdrawal marked paid. ${latestCoins.toLocaleString()} coins deducted.`
      );

      await refreshAll();
    } catch (err) {
      console.error("Mark withdrawal paid error:", err);

      notifyError(
        `Unable to complete this action: ${err.message || "Unknown error"}. Verify the wallet balance and request status before retrying.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function rejectWithdrawal(request) {
    if (busy) return;

    const status = String(request.status || "").toLowerCase();

    if (status !== "pending" && status !== "approved") {
      notifyError("This withdrawal can no longer be rejected.");
      return;
    }

    const confirmed = window.confirm(
      "Reject this withdrawal request? Coins will not be deducted by this action."
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const latest = await databases.getDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        request.$id
      );

      const latestStatus = String(latest.status || "").toLowerCase();

      if (
        latestStatus !== "pending" &&
        latestStatus !== "approved"
      ) {
        throw new Error("The withdrawal can no longer be rejected.");
      }

      await databases.updateDocument(
        DATABASE_ID,
        WITHDRAW_COLLECTION,
        latest.$id,
        {
          status: "rejected",
        }
      );

      notifySuccess(
        "Withdrawal rejected. No coins were deducted by this action."
      );

      await refreshAll();
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Unable to reject withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>Checking administrator access...</div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <h1>Access denied</h1>
          <p style={styles.muted}>
            This page is only available to the authorized administrator.
          </p>

          {error && <div style={styles.error}>{error}</div>}
        </div>
      </main>
    );
  }

  const pendingCoinDeposits = deposits.filter(
    (item) =>
      Number(item.coins || 0) > 0 &&
      String(item.status || "pending").toLowerCase() === "pending"
  );

  const legacyDeposits = deposits.filter(
    (item) => !(Number(item.coins || 0) > 0)
  );

  const pendingWithdrawals = withdrawals.filter(
    (item) =>
      String(item.status || "pending").toLowerCase() === "pending"
  );

  const approvedWithdrawals = withdrawals.filter(
    (item) =>
      String(item.status || "").toLowerCase() === "approved"
  );

  const paidWithdrawals = withdrawals.filter(
    (item) =>
      String(item.status || "").toLowerCase() === "paid"
  );

  const totalCoinsRequested = pendingCoinDeposits.reduce(
    (total, item) => total + Number(item.coins || 0),
    0
  );

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.brand}>WIN9JA LIFE</div>
            <h1 style={styles.heading}>Admin Dashboard</h1>
            <p style={styles.subtitle}>
              Manage coin purchases, withdrawals, and game activity.
            </p>
          </div>

          <button
            style={{ ...styles.button, ...styles.blue }}
            onClick={refreshAll}
            disabled={busy}
          >
            Refresh dashboard
          </button>
        </header>

        {message && <div style={styles.success}>{message}</div>}
        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.warning}>
          <strong>Payment safety:</strong> Verify deposits independently
          before crediting coins. For withdrawals, send the payment
          first, then mark the request as paid. This dashboard uses
          client-side database updates; it is not a substitute for
          server-side atomic processing and authorization.
        </div>

        <section style={styles.cards}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending coin purchases</span>
            <strong style={styles.statNumber}>
              {pendingCoinDeposits.length}
            </strong>
          </div>

          <div style={styles.stat}>
            <span style={styles.statLabel}>Coins awaiting approval</span>
            <strong style={styles.statNumber}>
              {totalCoinsRequested.toLocaleString()}
            </strong>
          </div>

          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending withdrawals</span>
            <strong style={styles.statNumber}>
              {pendingWithdrawals.length}
            </strong>
          </div>

          <div style={styles.stat}>
            <span style={styles.statLabel}>Approved, awaiting payment</span>
            <strong style={styles.statNumber}>
              {approvedWithdrawals.length}
            </strong>
          </div>

          <div style={styles.stat}>
            <span style={styles.statLabel}>Completed withdrawals</span>
            <strong style={styles.statNumber}>
              {paidWithdrawals.length}
            </strong>
          </div>

          <div style={styles.stat}>
            <span style={styles.statLabel}>Matches loaded</span>
            <strong style={styles.statNumber}>
              {matches.length}
            </strong>
          </div>
        </section>

        {/* COIN PURCHASES */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Coin purchase requests</h2>

          <p style={styles.muted}>
            Approving a verified purchase adds coins to the user's
            coins field. It does not increase their game balance.
          </p>

          {pendingCoinDeposits.length === 0 ? (
            <p style={styles.muted}>
              There are no pending coin purchase requests.
            </p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Coins</th>
                  <th style={styles.th}>Payment</th>
                  <th style={styles.th}>Reference / TXID</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {pendingCoinDeposits.map((deposit) => (
                  <tr key={deposit.$id}>
                    <td style={styles.td}>
                      <div>{deposit.userEmail || "—"}</div>
                      <div style={styles.muted}>
                        {deposit.userId}
                      </div>
                    </td>

                    <td style={styles.td}>
                      <strong>
                        {Number(deposit.coins || 0).toLocaleString()}
                      </strong>
                      <div style={styles.muted}>
                        {deposit.packageId || ""}
                      </div>
                    </td>

                    <td style={styles.td}>
                      <div>
                        {money(
                          deposit.amount,
                          deposit.currency || "NGN"
                        )}
                      </div>
                      <div style={styles.muted}>
                        {deposit.paymentProvider || "—"}
                      </div>
                      <div style={styles.muted}>
                        {deposit.country || ""}
                      </div>
                    </td>

                    <td style={styles.td}>
                      <div style={{ overflowWrap: "anywhere" }}>
                        {deposit.paymentReference || deposit.reference || "—"}
                      </div>
                      {deposit.paymentNote && (
                        <div style={styles.muted}>
                          {deposit.paymentNote}
                        </div>
                      )}
                    </td>

                    <td style={styles.td}>
                      {formatDate(deposit.$createdAt)}
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actions}>
                        <button
                          style={{ ...styles.button, ...styles.green }}
                          disabled={busy}
                          onClick={() => approveCoinDeposit(deposit)}
                        >
                          Approve
                        </button>

                        <button
                          style={{ ...styles.button, ...styles.red }}
                          disabled={busy}
                          onClick={() => rejectDeposit(deposit)}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* WITHDRAWALS */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Withdrawal requests</h2>

          <p style={styles.muted}>
            Review bank and TRX details carefully. Approving a
            withdrawal does not deduct coins. Mark it paid only after
            you have actually sent the payment.
          </p>

          {withdrawals.length === 0 ? (
            <p style={styles.muted}>
              There are no withdrawal requests yet.
            </p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Coins</th>
                  <th style={styles.th}>Method</th>
                  <th style={styles.th}>Payment details</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {withdrawals.map((request) => {
                  const status = String(
                    request.status || "pending"
                  ).toLowerCase();

                  const coinAmount = Number(
                    request.coins ?? request.amount ?? 0
                  );

                  return (
                    <tr key={request.$id}>
                      <td style={styles.td}>
                        <div>{request.userId}</div>
                      </td>

                      <td style={styles.td}>
                        <strong>
                          {coinAmount.toLocaleString()}
                        </strong>
                      </td>

                      <td style={styles.td}>
                        {request.paymentMethod || "BANK_TRANSFER"}
                        <div style={styles.muted}>
                          {request.country || ""}
                        </div>
                      </td>

                      <td style={styles.td}>
                        {request.paymentMethod === "TRX" ? (
                          <div style={{ overflowWrap: "anywhere" }}>
                            <strong>TRX address</strong>
                            <br />
                            {request.trxAddress || "Missing address"}
                          </div>
                        ) : (
                          <>
                            <div>{request.bank || "Bank not provided"}</div>
                            <div>{request.accountName || ""}</div>
                            <div>
                              {request.accountNumber || ""}
                            </div>
                          </>
                        )}
                      </td>

                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...statusStyle(status),
                          }}
                        >
                          {status}
                        </span>
                      </td>

                      <td style={styles.td}>
                        {formatDate(request.$createdAt)}
                      </td>

                      <td style={styles.td}>
                        <div style={styles.actions}>
                          {status === "pending" && (
                            <button
                              style={{
                                ...styles.button,
                                ...styles.green,
                              }}
                              disabled={busy}
                              onClick={() =>
                                approveWithdrawal(request)
                              }
                            >
                              Approve
                            </button>
                          )}

                          {status === "approved" && (
                            <button
                              style={{
                                ...styles.button,
                                ...styles.blue,
                              }}
                              disabled={busy}
                              onClick={() =>
                                markWithdrawalPaid(request)
                              }
                            >
                              Mark paid
                            </button>
                          )}

                          {(status === "pending" ||
                            status === "approved") && (
                            <button
                              style={{
                                ...styles.button,
                                ...styles.red,
                              }}
                              disabled={busy}
                              onClick={() =>
                                rejectWithdrawal(request)
                              }
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* EXISTING GAME-FUND DEPOSITS */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>
            Other deposit records
          </h2>

          <p style={styles.muted}>
            These records do not contain a valid coins quantity, so
            this dashboard will not credit them as coin purchases.
            Review older game-fund deposit records using your existing
            game-fund workflow.
          </p>

          {legacyDeposits.length === 0 ? (
            <p style={styles.muted}>No other deposit records found.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Reference</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Date</th>
                </tr>
              </thead>

              <tbody>
                {legacyDeposits.map((deposit) => (
                  <tr key={deposit.$id}>
                    <td style={styles.td}>
                      {deposit.userId || "—"}
                    </td>
                    <td style={styles.td}>
                      {deposit.amount !== undefined
                        ? String(deposit.amount)
                        : "—"}
                    </td>
                    <td style={styles.td}>
                      {deposit.reference ||
                        deposit.paymentReference ||
                        "—"}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...statusStyle(deposit.status),
                        }}
                      >
                        {deposit.status || "pending"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {formatDate(deposit.$createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* MATCHES */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent matches</h2>

          {matches.length === 0 ? (
            <p style={styles.muted}>
              No match records were found, or the collection is not
              accessible.
            </p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Record ID</th>
                  <th style={styles.th}>Players / data</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Created</th>
                </tr>
              </thead>

              <tbody>
                {matches.map((match) => (
                  <tr key={match.$id}>
                    <td style={styles.td}>{match.$id}</td>
                    <td style={styles.td}>
                      {match.player1 || match.player2
                        ? `${match.player1 || ""} ${match.player2 || ""}`
                        : match.userId || "Match record"}
                    </td>
                    <td style={styles.td}>
                      {match.status || "—"}
                    </td>
                    <td style={styles.td}>
                      {formatDate(match.$createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* CASINO */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Casino activity</h2>

          {casinoRecords.length === 0 ? (
            <p style={styles.muted}>
              No casino records found in the configured collection.
            </p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Record ID</th>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Activity</th>
                  <th style={styles.th}>Created</th>
                </tr>
              </thead>

              <tbody>
                {casinoRecords.map((record) => (
                  <tr key={record.$id}>
                    <td style={styles.td}>{record.$id}</td>
                    <td style={styles.td}>
                      {record.userId || "—"}
                    </td>
                    <td style={styles.td}>
                      {record.game ||
                        record.type ||
                        record.result ||
                        "Casino record"}
                    </td>
                    <td style={styles.td}>
                      {formatDate(record.$createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p style={styles.muted}>
          Win9ja Life Admin · Authorized administrator only
        </p>
      </div>
    </main>
  );
}