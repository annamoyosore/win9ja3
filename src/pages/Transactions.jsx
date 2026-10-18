// =============================================
// WIN9JA LIFE — TRANSACTIONS
// SECTION 1: IMPORTS, HELPERS AND DATA BUILDERS
// File: src/pages/Transactions.jsx
// =============================================

import { useCallback, useEffect, useState } from "react";

import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  CASINO_COLLECTION,
  DEPOSIT_COLLECTION,
  WITHDRAW_COLLECTION,
  TRANSACTION_COLLECTION,
  Query,
} from "../lib/appwrite";

// Existing game collection
const GAME_COLLECTION = "games";

// =============================================
// GENERAL HELPERS
// =============================================

function getStatus(record = {}) {
  return String(
    record.status ||
      record.paymentStatus ||
      record.transactionStatus ||
      record.result ||
      "completed"
  ).toLowerCase();
}

function getDate(record = {}) {
  return (
    record.$createdAt ||
    record.createdAt ||
    record.date ||
    record.timestamp ||
    record.updatedAt ||
    ""
  );
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCoins(value) {
  const amount = Number(value || 0);

  return `${amount.toLocaleString()} coins`;
}

function formatMoney(value, currency = "NGN") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();

  if (
    ["approved", "completed", "success", "successful", "paid", "won"].includes(
      value
    )
  ) {
    return "success";
  }

  if (
    ["pending", "processing", "waiting", "in_progress"].includes(value)
  ) {
    return "pending";
  }

  if (
    ["rejected", "failed", "cancelled", "canceled", "declined", "lost"].includes(
      value
    )
  ) {
    return "failed";
  }

  return "neutral";
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();

  const labels = {
    approved: "Approved",
    completed: "Completed",
    success: "Successful",
    successful: "Successful",
    paid: "Paid",
    pending: "Pending",
    processing: "Processing",
    rejected: "Rejected",
    failed: "Failed",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    declined: "Declined",
    won: "Won",
    lost: "Lost",
    refunded: "Refunded",
  };

  return labels[value] || value.replace(/_/g, " ") || "Completed";
}

function getErrorMessage(error) {
  return (
    error?.message ||
    error?.response?.message ||
    "Unable to load this transaction data."
  );
}

function getFirstValue(record, fields, fallback = "") {
  for (const field of fields) {
    const value = record?.[field];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function getCoinAmount(record = {}) {
  return Number(
    getFirstValue(
      record,
      [
        "coins",
        "coinAmount",
        "amountCoins",
        "stake",
        "entryFee",
        "betAmount",
      ],
      0
    )
  );
}

function getMoneyAmount(record = {}) {
  return Number(
    getFirstValue(
      record,
      ["amount", "moneyAmount", "paymentAmount", "totalAmount"],
      0
    )
  );
}

function getReference(record = {}) {
  return String(
    getFirstValue(
      record,
      [
        "paymentReference",
        "transactionReference",
        "reference",
        "transactionId",
        "paymentId",
        "$id",
      ],
      ""
    )
  );
}

// =============================================
// FETCH ALL DOCUMENTS FOR A USER
// Tries known user ID fields separately.
// =============================================

async function fetchUserRecords(
  collectionId,
  userId,
  userFields = ["userId"]
) {
  if (!userId) return [];

  let lastError = null;

  for (const field of userFields) {
    try {
      const allDocuments = [];
      let offset = 0;
      const pageSize = 100;

      while (true) {
        const response = await databases.listDocuments(
          DATABASE_ID,
          collectionId,
          [
            Query.equal(field, userId),
            Query.limit(pageSize),
            Query.offset(offset),
          ]
        );

        const documents = response.documents || [];

        allDocuments.push(...documents);

        if (documents.length < pageSize) break;

        offset += documents.length;
      }

      // Remove duplicate documents if the collection is queried
      // through multiple fields by the calling code.
      return allDocuments;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn(
      `Could not read collection "${collectionId}" for this user:`,
      lastError
    );
  }

  return [];
}

// =============================================
// CREATE A STANDARD TRANSACTION ITEM
// =============================================

function makeTransaction({
  id,
  type,
  title,
  description = "",
  amount = 0,
  unit = "coins",
  direction = "neutral",
  status = "completed",
  date = "",
  reference = "",
  source = "",
}) {
  return {
    id: String(id || `${type}-${reference}-${date}`),
    type,
    title,
    description,
    amount: Number(amount || 0),
    unit,
    direction,
    status: String(status || "completed").toLowerCase(),
    date,
    reference,
    source,
  };
}

// =============================================
// BUILD TRANSACTION RECORDS ALREADY SAVED
// IN THE TRANSACTIONS COLLECTION
// =============================================

function buildSavedTransactions(records = []) {
  return records.map((record) => {
    const rawType = String(
      getFirstValue(
        record,
        ["type", "transactionType", "category", "action"],
        "transaction"
      )
    ).toLowerCase();

    const amount = Number(
      getFirstValue(
        record,
        ["amount", "coins", "coinAmount", "value"],
        0
      )
    );

    const currency = getFirstValue(record, ["currency"], "NGN");

    const isMoney =
      rawType.includes("deposit") ||
      rawType.includes("payment") ||
      rawType.includes("purchase") ||
      rawType.includes("withdraw");

    const isWithdrawal = rawType.includes("withdraw");

    const isCredit =
      rawType.includes("award") ||
      rawType.includes("win") ||
      rawType.includes("refund") ||
      rawType.includes("credit") ||
      rawType.includes("deposit") ||
      rawType.includes("purchase");

    let title = String(
      getFirstValue(record, ["title", "description", "name"], "")
    );

    if (!title) {
      if (rawType.includes("withdraw")) {
        title = "Coin withdrawal";
      } else if (rawType.includes("deposit")) {
        title = "Deposit";
      } else if (rawType.includes("purchase")) {
        title = "Coin purchase";
      } else if (rawType.includes("refund")) {
        title = "Coin refund";
      } else if (rawType.includes("win") || rawType.includes("award")) {
        title = "Winning reward";
      } else if (rawType.includes("stake") || rawType.includes("spend")) {
        title = "Game stake";
      } else {
        title = "Wallet transaction";
      }
    }

    const status = getStatus(record);

    return makeTransaction({
      id: record.$id,
      type: rawType,
      title,
      description: String(
        getFirstValue(
          record,
          ["note", "details", "message", "paymentProvider"],
          ""
        )
      ),
      amount,
      unit: isMoney ? currency : "coins",
      direction: isWithdrawal
        ? "debit"
        : isCredit
          ? "credit"
          : "neutral",
      status,
      date: getDate(record),
      reference: getReference(record),
      source: TRANSACTION_COLLECTION,
    });
  });
}

// =============================================
// BUILD WHOT / GAME MATCH TRANSACTIONS
// =============================================

function buildMatchTransactions(matches = [], games = [], userId) {
  const gameById = new Map(
    games.map((game) => [String(game.$id), game])
  );

  return matches
    .filter((match) => {
      const hostId = String(
        getFirstValue(match, ["hostId", "creatorId", "player1Id"], "")
      );

      const opponentId = String(
        getFirstValue(match, ["opponentId", "player2Id"], "")
      );

      const matchUserId = String(
        getFirstValue(match, ["userId", "playerId"], "")
      );

      return (
        hostId === userId ||
        opponentId === userId ||
        matchUserId === userId
      );
    })
    .map((match) => {
      const gameId = getFirstValue(match, ["gameId", "game"], "");
      const game = gameById.get(String(gameId));

      const gameName = String(
        getFirstValue(
          match,
          ["gameName", "gameType", "name"],
          getFirstValue(game, ["name", "title", "gameName"], "Game")
        )
      );

      const status = getStatus(match);

      const stake = Number(
        getFirstValue(
          match,
          ["stake", "entryFee", "betAmount", "coins", "amount"],
          0
        )
      );

      const winnerId = String(
        getFirstValue(match, ["winnerId", "winner", "winnerUserId"], "")
      );

      const isWinner = winnerId === userId;

      const isCancelled = [
        "cancelled",
        "canceled",
        "rejected",
        "refunded",
      ].includes(status);

      const payout = Number(
        getFirstValue(
          match,
          ["payoutAmount", "winnerPayout", "reward", "winnings"],
          0
        )
      );

      let title = `${gameName} match`;
      let direction = "neutral";
      let amount = stake;

      if (isCancelled) {
        title = `${gameName} match refund`;
        direction = "credit";
      } else if (isWinner) {
        title = `${gameName} match won`;
        direction = "credit";
        amount = payout || 0;
      } else if (winnerId && winnerId !== userId) {
        title = `${gameName} match stake`;
        direction = "debit";
      } else if (["completed", "finished", "draw"].includes(status)) {
        title = `${gameName} match completed`;
      } else {
        title = `${gameName} match`;
      }

      return makeTransaction({
        id: `match-${match.$id}`,
        type: "game",
        title,
        description: isWinner
          ? "Winning result recorded"
          : "Game match activity",
        amount,
        unit: "coins",
        direction,
        status,
        date: getDate(match),
        reference: match.$id,
        source: MATCH_COLLECTION,
      });
    });
}

// =============================================
// BUILD CASINO TRANSACTIONS
// =============================================

function buildCasinoTransactions(records = []) {
  return records.map((record) => {
    const status = getStatus(record);

    const stake = Number(
      getFirstValue(
        record,
        ["stake", "betAmount", "coinsBet", "bet", "amount"],
        0
      )
    );

    const payout = Number(
      getFirstValue(
        record,
        ["payout", "winAmount", "winnings", "reward", "win"],
        0
      )
    );

    const won =
      record.won === true ||
      record.isWinner === true ||
      payout > 0 ||
      status === "won";

    const title = won ? "Casino winnings" : "Casino game";

    return makeTransaction({
      id: `casino-${record.$id}`,
      type: "casino",
      title,
      description: String(
        getFirstValue(record, ["gameName", "gameType", "game"], "Casino")
      ),
      amount: won ? payout : stake,
      unit: "coins",
      direction: won ? "credit" : "debit",
      status,
      date: getDate(record),
      reference: getReference(record),
      source: CASINO_COLLECTION,
    });
  });
}

// =============================================
// BUILD COIN PURCHASE / DEPOSIT TRANSACTIONS
// =============================================

function buildDepositTransactions(records = []) {
  return records.map((record) => {
    const status = getStatus(record);
    const approved = [
      "approved",
      "completed",
      "success",
      "successful",
      "paid",
    ].includes(status);

    const coins = getCoinAmount(record);
    const amount = getMoneyAmount(record);
    const currency = getFirstValue(record, ["currency"], "NGN");

    return makeTransaction({
      id: `deposit-${record.$id}`,
      type: approved ? "coin_purchase" : "deposit",
      title: approved ? "Coin purchase successful" : "Coin purchase request",
      description: [
        record.paymentProvider,
        record.packageId ? `Package: ${record.packageId}` : "",
        record.paymentNote || "",
      ]
        .filter(Boolean)
        .join(" • "),
      amount: approved ? coins : amount,
      unit: approved ? "coins" : currency,
      direction: approved ? "credit" : "neutral",
      status,
      date: getDate(record),
      reference: getReference(record),
      source: DEPOSIT_COLLECTION,
    });
  });
}

// =============================================
// BUILD WITHDRAWAL TRANSACTIONS
// =============================================

function buildWithdrawalTransactions(records = []) {
  return records.map((record) => {
    const status = getStatus(record);

    const paid = [
      "paid",
      "completed",
      "success",
      "successful",
    ].includes(status);

    const coins = Number(
      getFirstValue(record, ["coins", "coinAmount", "amountCoins"], 0)
    );

    const money = getMoneyAmount(record);

    // Prefer the explicit coin field. If the request only has
    // "amount", do not assume that amount is coins.
    const hasCoinAmount =
      record.coins !== undefined ||
      record.coinAmount !== undefined ||
      record.amountCoins !== undefined;

    return makeTransaction({
      id: `withdrawal-${record.$id}`,
      type: "withdrawal",
      title: paid
        ? "Withdrawal completed"
        : "Withdrawal request",
      description: String(
        getFirstValue(
          record,
          ["paymentMethod", "withdrawalMethod", "walletAddress", "note"],
          ""
        )
      ),
      amount: hasCoinAmount ? coins : money,
      unit: hasCoinAmount ? "coins" : getFirstValue(record, ["currency"], "NGN"),
      direction: paid ? "debit" : "neutral",
      status,
      date: getDate(record),
      reference: getReference(record),
      source: WITHDRAW_COLLECTION,
    });
  });
}
export default function Transactions() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // ===========================================
  // LOAD USER TRANSACTION HISTORY
  // ===========================================

  const loadTransactions = useCallback(async () => {
    setErrorMessage("");

    try {
      setLoading(true);

      const currentUser = await account.get();
      setUser(currentUser);

      const userId = currentUser.$id;

      const [
        savedRecords,
        matches,
        casinoRecords,
        deposits,
        withdrawals,
        games,
      ] = await Promise.all([
        fetchUserRecords(TRANSACTION_COLLECTION, userId, [
          "userId",
        ]),

        fetchUserRecords(MATCH_COLLECTION, userId, [
          "hostId",
          "opponentId",
          "userId",
          "playerId",
        ]),

        fetchUserRecords(CASINO_COLLECTION, userId, [
          "userId",
        ]),

        fetchUserRecords(DEPOSIT_COLLECTION, userId, [
          "userId",
        ]),

        fetchUserRecords(WITHDRAW_COLLECTION, userId, [
          "userId",
        ]),

        fetchUserRecords(GAME_COLLECTION, userId, [
          "hostId",
          "opponentId",
          "userId",
          "playerId",
        ]),
      ]);

      const builtTransactions = [
        ...buildSavedTransactions(savedRecords),
        ...buildMatchTransactions(matches, games, userId),
        ...buildCasinoTransactions(casinoRecords),
        ...buildDepositTransactions(deposits),
        ...buildWithdrawalTransactions(withdrawals),
      ];

      // Remove duplicate records that may appear from multiple
      // sources. A source and document reference form the key.
      const unique = new Map();

      builtTransactions.forEach((item) => {
        const key = `${item.source}-${item.reference || item.id}`;

        if (!unique.has(key)) {
          unique.set(key, item);
        }
      });

      const sorted = Array.from(unique.values()).sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime() || 0;
        const dateB = new Date(b.date || 0).getTime() || 0;

        return dateB - dateA;
      });

      setTransactions(sorted);
    } catch (error) {
      console.error("Win9ja Life transaction loading error:", error);

      setErrorMessage(
        getErrorMessage(error) ||
          "We could not load your transaction history."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // ===========================================
  // FILTER TRANSACTIONS
  // ===========================================

  const filters = [
    { id: "all", label: "All" },
    { id: "game", label: "Whot Games" },
    { id: "casino", label: "Casino" },
    { id: "coin_purchase", label: "Coin Purchases" },
    { id: "withdrawal", label: "Withdrawals" },
    { id: "deposit", label: "Deposits" },
  ];

  const filteredTransactions =
    activeFilter === "all"
      ? transactions
      : transactions.filter((item) => {
          if (activeFilter === "game") {
            return (
              item.type === "game" ||
              item.type.includes("match") ||
              item.source === MATCH_COLLECTION
            );
          }

          if (activeFilter === "coin_purchase") {
            return (
              item.type === "coin_purchase" ||
              item.type.includes("purchase")
            );
          }

          if (activeFilter === "deposit") {
            return (
              item.type === "deposit" ||
              item.source === DEPOSIT_COLLECTION
            );
          }

          if (activeFilter === "withdrawal") {
            return (
              item.type === "withdrawal" ||
              item.source === WITHDRAW_COLLECTION
            );
          }

          return item.type === activeFilter;
        });

  // ===========================================
  // SUMMARY TOTALS
  // These totals are summaries of displayed records,
  // not a substitute for the authoritative wallet balance.
  // ===========================================

  const completedCredits = transactions
    .filter(
      (item) =>
        item.direction === "credit" &&
        ["approved", "completed", "success", "successful", "paid", "won"].includes(
          item.status
        )
    )
    .reduce((sum, item) => sum + item.amount, 0);

  const completedDebits = transactions
    .filter(
      (item) =>
        item.direction === "debit" &&
        ["completed", "success", "successful", "paid", "won"].includes(
          item.status
        )
    )
    .reduce((sum, item) => sum + item.amount, 0);

  function handleRefresh() {
    setRefreshing(true);
    loadTransactions();
  }

  // ===========================================
  // RENDER
  // ===========================================

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes win9ja-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes win9ja-fade-in {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .win9ja-transaction-row {
          animation: win9ja-fade-in 0.25s ease-out;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .win9ja-transaction-row:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 16px rgba(0,0,0,0.06);
        }

        .win9ja-filter-button {
          transition: all 0.18s ease;
          cursor: pointer;
          white-space: nowrap;
        }

        .win9ja-filter-button:focus-visible,
        .win9ja-refresh-button:focus-visible {
          outline: 2px solid #16a34a;
          outline-offset: 3px;
        }

        .win9ja-refresh-button {
          cursor: pointer;
        }

        @media (max-width: 480px) {
          .win9ja-summary-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .win9ja-transaction-row {
            padding: 12px !important;
          }

          .win9ja-transaction-description {
            max-width: 190px;
            overflow-wrap: anywhere;
          }
        }
      `}</style>

      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>WIN9JA LIFE WALLET</div>

          <h1 style={styles.heading}>Transactions</h1>

          <p style={styles.subtitle}>
            Your coin activity, purchases and withdrawals in one place.
          </p>
        </div>

        <button
          type="button"
          className="win9ja-refresh-button"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          style={{
            ...styles.refreshButton,
            opacity: loading || refreshing ? 0.65 : 1,
          }}
          aria-label="Refresh transaction history"
        >
          <span
            style={{
              display: "inline-block",
              animation:
                refreshing || loading
                  ? "win9ja-spin 1s linear infinite"
                  : "none",
            }}
          >
            ↻
          </span>{" "}
          Refresh
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="win9ja-summary-grid" style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>🪙</div>

          <div style={styles.summaryLabel}>Transactions</div>

          <div style={styles.summaryValue}>
            {transactions.length.toLocaleString()}
          </div>

          <div style={styles.summaryHint}>All recorded activities</div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>↗️</div>

          <div style={styles.summaryLabel}>Credits recorded</div>

          <div style={styles.summaryValue}>
            {completedCredits.toLocaleString()}
          </div>

          <div style={styles.summaryHint}>Recorded credit amounts</div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>↘️</div>

          <div style={styles.summaryLabel}>Debits recorded</div>

          <div style={styles.summaryValue}>
            {completedDebits.toLocaleString()}
          </div>

          <div style={styles.summaryHint}>Recorded debit amounts</div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={styles.filterSection}>
        <h2 style={styles.sectionHeading}>Transaction history</h2>

        <div style={styles.filterList}>
          {filters.map((filter) => {
            const active = activeFilter === filter.id;

            return (
              <button
                type="button"
                key={filter.id}
                className="win9ja-filter-button"
                onClick={() => setActiveFilter(filter.id)}
                style={{
                  ...styles.filterButton,
                  ...(active ? styles.activeFilterButton : {}),
                }}
                aria-pressed={active}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* LOADING */}
      {loading && (
        <div style={styles.stateCard}>
          <div style={styles.spinner} />

          <p style={styles.stateTitle}>Loading transactions...</p>

          <p style={styles.stateText}>
            Please wait while we retrieve your activity.
          </p>
        </div>
      )}

      {/* ERROR */}
      {!loading && errorMessage && (
        <div style={styles.errorCard}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>

          <h3 style={styles.stateTitle}>Unable to load history</h3>

          <p style={styles.stateText}>{errorMessage}</p>

          <button
            type="button"
            onClick={handleRefresh}
            style={styles.primaryButton}
          >
            Try again
          </button>
        </div>
      )}

      {/* EMPTY STATE */}
      {!loading &&
        !errorMessage &&
        filteredTransactions.length === 0 && (
          <div style={styles.stateCard}>
            <div style={styles.emptyIcon}>🧾</div>

            <h3 style={styles.stateTitle}>No transactions found</h3>

            <p style={styles.stateText}>
              {activeFilter === "all"
                ? "Your recorded transactions will appear here when available."
                : "There are no records in this category yet."}
            </p>

            {activeFilter !== "all" && (
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                style={styles.primaryButton}
              >
                View all transactions
              </button>
            )}
          </div>
        )}

      {/* TRANSACTION LIST */}
      {!loading && !errorMessage && filteredTransactions.length > 0 && (
        <div style={styles.transactionList}>
          {filteredTransactions.map((item) => {
            const statusStyle =
              styles.status[normalizeStatus(item.status)] ||
              styles.status.neutral;

            const sign =
              item.direction === "credit"
                ? "+"
                : item.direction === "debit"
                  ? "−"
                  : "";

            const amountColor =
              item.direction === "credit"
                ? "#15803d"
                : item.direction === "debit"
                  ? "#dc2626"
                  : "#64748b";

            const icon =
              item.type === "casino"
                ? "🎰"
                : item.type === "withdrawal"
                  ? "💸"
                  : item.type === "deposit" ||
                      item.type === "coin_purchase"
                    ? "🪙"
                    : item.direction === "credit"
                      ? "🏆"
                      : item.direction === "debit"
                        ? "🎮"
                        : "📄";

            return (
              <div
                key={item.id}
                className="win9ja-transaction-row"
                style={styles.transactionCard}
              >
                <div style={styles.transactionIcon}>{icon}</div>

                <div style={styles.transactionMain}>
                  <div style={styles.transactionTitleRow}>
                    <h3 style={styles.transactionTitle}>{item.title}</h3>

                    <span style={statusStyle}>
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  {item.description && (
                    <div
                      className="win9ja-transaction-description"
                      style={styles.transactionDescription}
                    >
                      {item.description}
                    </div>
                  )}

                  <div style={styles.transactionMeta}>
                    <span>{formatDate(item.date)}</span>

                    {item.reference && (
                      <span style={styles.reference}>
                        Ref: {item.reference}
                      </span>
                    )}
                  </div>
                </div>

                <div style={styles.transactionAmount}>
                  <div
                    style={{
                      ...styles.amountValue,
                      color: amountColor,
                    }}
                  >
                    {sign}
                    {Number(item.amount || 0).toLocaleString()}
                  </div>

                  <div style={styles.amountUnit}>
                    {item.unit === "coins"
                      ? "coins"
                      : item.unit}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FOOTER NOTE */}
      <div style={styles.footerNote}>
        <span style={{ fontSize: 16 }}>🔒</span>

        <span>
          This page displays available transaction records. Some older
          game activities may not appear if they were never saved as
          transaction records.
        </span>
      </div>

      <div style={styles.footer}>
        © {new Date().getFullYear()} Win9ja Life
      </div>
    </div>
  );
}

// =============================================
// INLINE STYLES
// =============================================

const styles = {
  page: {
    width: "100%",
    maxWidth: 1100,
    margin: "0 auto",
    padding: "22px 16px 35px",
    boxSizing: "border-box",
    color: "#172033",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    background: "#f8fafc",
    minHeight: "100vh",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 24,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: "#16a34a",
    marginBottom: 7,
  },

  heading: {
    fontSize: "clamp(26px, 5vw, 34px)",
    lineHeight: 1.15,
    fontWeight: 850,
    margin: 0,
    letterSpacing: -0.8,
    color: "#111827",
  },

  subtitle: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.6,
    margin: "9px 0 0",
    maxWidth: 500,
  },

  refreshButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid #dbe4e0",
    borderRadius: 12,
    background: "#ffffff",
    color: "#166534",
    fontSize: 13,
    fontWeight: 750,
    padding: "10px 14px",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 30,
  },

  summaryCard: {
    minWidth: 0,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: 18,
    padding: "17px 15px",
    boxShadow: "0 4px 18px rgba(15,23,42,0.035)",
  },

  summaryIcon: {
    fontSize: 23,
    marginBottom: 11,
  },

  summaryLabel: {
    fontSize: 12,
    fontWeight: 650,
    color: "#64748b",
    marginBottom: 7,
  },

  summaryValue: {
    fontSize: "clamp(18px, 3vw, 25px)",
    fontWeight: 850,
    letterSpacing: -0.4,
    overflowWrap: "anywhere",
    color: "#111827",
  },

  summaryHint: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 7,
    lineHeight: 1.4,
  },

  filterSection: {
    marginBottom: 17,
  },

  sectionHeading: {
    fontSize: 18,
    fontWeight: 800,
    margin: "0 0 15px",
    color: "#172033",
  },

  filterList: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    padding: "2px 1px 8px",
    scrollbarWidth: "thin",
  },

  filterButton: {
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    color: "#64748b",
    borderRadius: 999,
    padding: "9px 14px",
    fontSize: 12,
    fontWeight: 750,
    flexShrink: 0,
  },

  activeFilterButton: {
    background: "#16a34a",
    color: "#ffffff",
    borderColor: "#16a34a",
    boxShadow: "0 4px 10px rgba(22,163,74,0.18)",
  },

  transactionList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  transactionCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 15,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: 16,
    boxShadow: "0 3px 12px rgba(15,23,42,0.025)",
    minWidth: 0,
  },

  transactionIcon: {
    width: 43,
    height: 43,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0fdf4",
    border: "1px solid #dcfce7",
    borderRadius: 14,
    fontSize: 20,
  },

  transactionMain: {
    flex: 1,
    minWidth: 0,
  },

  transactionTitleRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 5,
  },

  transactionTitle: {
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.4,
    color: "#1e293b",
    margin: 0,
    overflowWrap: "anywhere",
  },

  transactionDescription: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.5,
    marginBottom: 7,
  },

  transactionMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 1.5,
  },

  reference: {
    overflowWrap: "anywhere",
    color: "#64748b",
  },

  transactionAmount: {
    flexShrink: 0,
    textAlign: "right",
    maxWidth: "34%",
  },

  amountValue: {
    fontSize: 14,
    fontWeight: 850,
    overflowWrap: "anywhere",
  },

  amountUnit: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 5,
  },

  status: {
    success: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "4px 8px",
      background: "#dcfce7",
      color: "#166534",
      fontSize: 9,
      fontWeight: 850,
      textTransform: "capitalize",
    },

    pending: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "4px 8px",
      background: "#fef3c7",
      color: "#92400e",
      fontSize: 9,
      fontWeight: 850,
      textTransform: "capitalize",
    },

    failed: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "4px 8px",
      background: "#fee2e2",
      color: "#991b1b",
      fontSize: 9,
      fontWeight: 850,
      textTransform: "capitalize",
    },

    neutral: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "4px 8px",
      background: "#f1f5f9",
      color: "#475569",
      fontSize: 9,
      fontWeight: 850,
      textTransform: "capitalize",
    },
  },

  stateCard: {
    textAlign: "center",
    padding: "42px 20px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: 18,
  },

  errorCard: {
    textAlign: "center",
    padding: "32px 20px",
    border: "1px solid #fecaca",
    background: "#fffafa",
    borderRadius: 18,
  },

  spinner: {
    width: 31,
    height: 31,
    borderRadius: "50%",
    border: "3px solid #dcfce7",
    borderTopColor: "#16a34a",
    animation: "win9ja-spin 0.8s linear infinite",
    margin: "0 auto 16px",
  },

  emptyIcon: {
    fontSize: 35,
    marginBottom: 12,
  },

  stateTitle: {
    fontSize: 16,
    fontWeight: 800,
    margin: "0 0 8px",
    color: "#1e293b",
  },

  stateText: {
    fontSize: 12,
    lineHeight: 1.7,
    color: "#64748b",
    margin: "0 auto 14px",
    maxWidth: 420,
  },

  primaryButton: {
    border: "none",
    borderRadius: 10,
    background: "#16a34a",
    color: "#ffffff",
    padding: "11px 17px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },

  footerNote: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    padding: "13px 14px",
    marginTop: 23,
    border: "1px solid #e2e8f0",
    background: "#f1f5f9",
    borderRadius: 13,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.7,
  },

  footer: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 10,
    paddingTop: 23,
  },
};