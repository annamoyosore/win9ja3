import { useEffect, useState, useCallback } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  CASINO_COLLECTION,
  Query,
} from "../lib/appwrite";

const GAME_COLLECTION = "games";
const DEPOSIT_COLLECTION = "deposit_requests";
const WITHDRAW_COLLECTION = "withdrawal_requests";

const PAGE_SIZE = 100;

function getStatus(record) {
  return String(record?.status || record?.result || "pending").toLowerCase();
}

function getDate(record) {
  const value =
    record?.$createdAt ||
    record?.createdAt ||
    record?.date ||
    record?.timestamp ||
    null;

  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCoins(value) {
  const amount = Number(value || 0);

  return `${amount > 0 ? "+" : ""}${amount.toLocaleString()} coins`;
}

function formatMoney(value, currency = "NGN") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function normalizeStatus(status) {
  const value = String(status || "pending").toLowerCase();

  if (
    ["success", "successful", "completed", "finished", "paid", "approved", "won"].includes(
      value
    )
  ) {
    return value === "won" ? "won" : "completed";
  }

  if (["failed", "rejected", "cancelled", "canceled", "lost"].includes(value)) {
    return value === "lost" ? "lost" : "failed";
  }

  if (["waiting", "pending", "processing", "matched", "running"].includes(value)) {
    return value;
  }

  return value;
}

function statusLabel(status) {
  const normalized = normalizeStatus(status);

  const labels = {
    completed: "Completed",
    won: "Won",
    lost: "Lost",
    failed: "Failed",
    pending: "Pending",
    waiting: "Waiting",
    matched: "Matched",
    running: "In progress",
    processing: "Processing",
  };

  return labels[normalized] || normalized.replace(/_/g, " ");
}

function getErrorMessage(error) {
  return (
    error?.message ||
    "Unable to load your transactions. Please try again."
  );
}

async function fetchAllDocuments(collectionId, userId, userFields = ["userId"]) {
  const allDocuments = [];
  let offset = 0;

  while (true) {
    const queries = [
      Query.limit(PAGE_SIZE),
      Query.offset(offset),
    ];

    if (userId && userFields.length > 0) {
      queries.push(
        Query.or(
          userFields.map((field) => Query.equal(field, userId))
        )
      );
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      collectionId,
      queries
    );

    allDocuments.push(...(response.documents || []));

    if (
      !response.documents ||
      response.documents.length < PAGE_SIZE ||
      allDocuments.length >= response.total
    ) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return allDocuments;
}

async function fetchUserRecords(collectionId, userId, userFields = ["userId"]) {
  try {
    return await fetchAllDocuments(collectionId, userId, userFields);
  } catch (error) {
    // Some Appwrite setups may not support Query.or.
    // Retry each user field separately and merge the results.
    if (userFields.length <= 1) throw error;

    const results = await Promise.all(
      userFields.map(async (field) => {
        try {
          return await fetchAllDocuments(collectionId, userId, [field]);
        } catch {
          return [];
        }
      })
    );

    const unique = new Map();

    results.flat().forEach((record) => {
      unique.set(record.$id, record);
    });

    return Array.from(unique.values());
  }
}

function makeTransaction({
  id,
  type,
  title,
  description,
  amount = 0,
  unit = "money",
  currency = "NGN",
  status = "pending",
  date = null,
  original = null,
}) {
  return {
    id: String(id || `${type}-${Date.now()}-${Math.random()}`),
    type,
    title,
    description,
    amount: Number(amount || 0),
    unit,
    currency,
    status: normalizeStatus(status),
    date,
    original,
  };
}

function buildMatchTransactions(matches, games, userId) {
  const gameMap = new Map(
    games.map((game) => [game.$id, game])
  );

  return matches.map((match) => {
    const game = match.gameId ? gameMap.get(match.gameId) : null;

    const status = getStatus(match);
    const stake = Number(match.stake ?? match.entryFee ?? 0);

    const winnerId =
      match.winnerId ||
      match.winner ||
      game?.winnerId ||
      game?.winner ||
      "";

    const isFinished = [
      "completed",
      "finished",
      "success",
      "successful",
    ].includes(status);

    const isWaiting = [
      "waiting",
      "pending",
      "matched",
      "running",
      "playing",
      "active",
    ].includes(status);

    let amount = 0;
    let title = "Whot Game";
    let description = "Whot match transaction";
    let transactionStatus = status;

    if (isFinished) {
      if (winnerId && winnerId === userId) {
        // payoutAmount should be saved by the game payout logic.
        // Older records may not contain it.
        const payout = Number(
          match.payoutAmount ??
          match.winnerPayout ??
          game?.payoutAmount ??
          game?.winnerPayout ??
          match.pot ??
          game?.pot ??
          0
        );

        amount = payout;
        title = "Whot Game Win";
        description =
          payout > 0
            ? `Winning payout: ${formatCoins(payout)}`
            : "You won this match. Payout details are unavailable.";
        transactionStatus = "won";
      } else if (winnerId) {
        amount = -stake;
        title = "Whot Game Loss";
        description = `Entry stake: ${formatCoins(stake)}`;
        transactionStatus = "lost";
      } else {
        title = "Whot Game";
        description = "Match finished; winner information unavailable.";
        transactionStatus = "completed";
      }
    } else if (isWaiting) {
      amount = -stake;
      title = "Whot Game Stake";
      description = `Entry stake: ${formatCoins(stake)}`;
    }

    return makeTransaction({
      id: `match-${match.$id}`,
      type: "game",
      title,
      description,
      amount,
      unit: "coins",
      status: transactionStatus,
      date: getDate(match) || getDate(game),
      original: match,
    });
  });
}

function buildCasinoTransactions(records) {
  return records.map((record) => {
    const status = getStatus(record);
    const stake = Number(record.stake ?? record.amount ?? 0);
    const win = Number(record.win ?? record.payout ?? 0);

    let amount = 0;
    let title = "Casino Game";
    let description = "Casino transaction";

    if (["won", "win", "completed", "success", "successful"].includes(status)) {
      amount = win - stake;
      title = amount > 0 ? "Casino Win" : "Casino Game";
      description =
        amount > 0
          ? `Net profit: ${formatCoins(amount)}`
          : "Casino round completed.";
    } else if (["lost", "loss", "failed"].includes(status)) {
      amount = -stake;
      title = "Casino Loss";
      description = `Stake lost: ${formatCoins(stake)}`;
    } else if (status === "free" || status === "almost") {
      title = "Casino Game";
      description = status === "free" ? "Free round" : "Almost won";
    } else {
      title = "Casino Stake";
      description = `Stake: ${formatCoins(stake)}`;
    }

    return makeTransaction({
      id: `casino-${record.$id}`,
      type: "casino",
      title,
      description,
      amount,
      unit: "coins",
      status,
      date: getDate(record),
      original: record,
    });
  });
}

function buildDepositTransactions(records) {
  return records.map((record) => {
    const status = getStatus(record);
    const coins = Number(record.coins || 0);
    const money = Number(record.amount || 0);
    const currency = record.currency || "NGN";
    const isCoinPurchase = coins > 0;

    let amount = 0;
    let unit = "money";
    let title = "Deposit";
    let description = formatMoney(money, currency);

    if (isCoinPurchase) {
      title = "Coin Purchase";
      description = `Purchase of ${formatCoins(coins)} · Payment: ${formatMoney(
        money,
        currency
      )}`;

      // Only approved purchases are shown as credited coins.
      if (status === "approved" || status === "completed" || status === "success") {
        amount = coins;
        unit = "coins";
      } else {
        amount = money;
        unit = "money";
      }
    } else {
      title = "Wallet Deposit";
      amount = money;
      unit = "money";
      description = formatMoney(money, currency);
    }

    return makeTransaction({
      id: `deposit-${record.$id}`,
      type: "deposit",
      title,
      description,
      amount,
      unit,
      currency,
      status,
      date: getDate(record),
      original: record,
    });
  });
}

function buildWithdrawalTransactions(records) {
  return records.map((record) => {
    const status = getStatus(record);
    const coins = Number(record.coins ?? record.amount ?? 0);
    const currency = record.currency || "NGN";

    let amount = 0;
    let title = "Withdrawal";
    let description = `Requested withdrawal: ${formatCoins(coins)}`;

    if (status === "paid" || status === "completed" || status === "success") {
      amount = -coins;
      title = "Withdrawal Paid";
      description = `Withdrawn: ${formatCoins(coins)}`;
    } else if (status === "rejected" || status === "failed") {
      title = "Withdrawal Rejected";
      description = "The withdrawal was rejected. Coins should not be deducted.";
    } else {
      title = "Withdrawal Request";
      description = `Requested: ${formatCoins(coins)} · Awaiting payment`;
    }

    return makeTransaction({
      id: `withdrawal-${record.$id}`,
      type: "withdrawal",
      title,
      description,
      amount,
      unit: "coins",
      currency,
      status,
      date: getDate(record),
      original: record,
    });
  });
}export default function Transactions() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTransactions = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const currentUser = await account.get();
      setUser(currentUser);

      const userId = currentUser.$id;

      const [
        matches,
        casinoRecords,
        deposits,
        withdrawals,
      ] = await Promise.all([
        fetchUserRecords(
          MATCH_COLLECTION,
          userId,
          ["hostId", "opponentId", "userId", "playerId"]
        ).catch(() => []),

        fetchUserRecords(
          CASINO_COLLECTION,
          userId,
          ["userId"]
        ).catch(() => []),

        fetchUserRecords(
          DEPOSIT_COLLECTION,
          userId,
          ["userId"]
        ).catch(() => []),

        fetchUserRecords(
          WITHDRAW_COLLECTION,
          userId,
          ["userId"]
        ).catch(() => []),
      ]);

      // Only show matches where this user is a participant.
      const uniqueMatches = new Map();

      matches.forEach((match) => {
        const isParticipant =
          match.hostId === userId ||
          match.opponentId === userId ||
          match.userId === userId ||
          match.playerId === userId;

        if (isParticipant) {
          uniqueMatches.set(match.$id, match);
        }
      });

      let games = [];

      try {
        games = await fetchUserRecords(
          GAME_COLLECTION,
          userId,
          ["hostId", "opponentId", "userId", "playerId"]
        );
      } catch {
        // Some projects do not use a separate games collection.
        games = [];
      }

      const allTransactions = [
        ...buildMatchTransactions(
          Array.from(uniqueMatches.values()),
          games,
          userId
        ),
        ...buildCasinoTransactions(casinoRecords),
        ...buildDepositTransactions(deposits),
        ...buildWithdrawalTransactions(withdrawals),
      ];

      allTransactions.sort((a, b) => {
        const dateA = a.date ? a.date.getTime() : 0;
        const dateB = b.date ? b.date.getTime() : 0;

        return dateB - dateA;
      });

      setTransactions(allTransactions);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filters = [
    { id: "all", label: "All" },
    { id: "game", label: "Whot Games" },
    { id: "casino", label: "Casino" },
    { id: "coinPurchase", label: "Coin Purchases" },
    { id: "withdrawal", label: "Withdrawals" },
    { id: "deposit", label: "Deposits" },
  ];

  const filteredTransactions = transactions.filter((transaction) => {
    if (activeFilter === "all") return true;

    if (activeFilter === "coinPurchase") {
      return (
        transaction.type === "deposit" &&
        transaction.title === "Coin Purchase"
      );
    }

    return transaction.type === activeFilter;
  });

  const totalWins = transactions
    .filter(
      (transaction) =>
        (transaction.type === "game" ||
          transaction.type === "casino") &&
        transaction.amount > 0 &&
        transaction.unit === "coins"
    )
    .reduce((total, transaction) => total + transaction.amount, 0);

  const purchasedCoins = transactions
    .filter(
      (transaction) =>
        transaction.type === "deposit" &&
        transaction.title === "Coin Purchase" &&
        transaction.unit === "coins"
    )
    .reduce((total, transaction) => total + transaction.amount, 0);

  const completedWithdrawals = transactions
    .filter(
      (transaction) =>
        transaction.type === "withdrawal" &&
        transaction.status === "completed"
    )
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);

  const getAmountColor = (transaction) => {
    if (transaction.amount > 0) return "#16a34a";
    if (transaction.amount < 0) return "#dc2626";
    return "#64748b";
  };

  const getAmountText = (transaction) => {
    if (transaction.unit === "coins") {
      return formatCoins(transaction.amount);
    }

    return formatMoney(transaction.amount, transaction.currency);
  };

  const getTypeIcon = (transaction) => {
    if (transaction.type === "game") return "🎮";
    if (transaction.type === "casino") return "🎰";
    if (transaction.type === "withdrawal") return "💸";
    if (transaction.type === "deposit") {
      return transaction.title === "Coin Purchase" ? "🪙" : "💰";
    }

    return "📄";
  };

  const getStatusColor = (status) => {
    if (["completed", "won"].includes(status)) return "#15803d";
    if (status === "lost") return "#b91c1c";
    if (["failed", "rejected"].includes(status)) return "#dc2626";
    if (["pending", "waiting", "processing", "matched", "running"].includes(status)) {
      return "#b45309";
    }

    return "#475569";
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <p>Loading your transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.heading}>Transactions</h1>
            <p style={styles.subheading}>
              Track your games, coin purchases, winnings and withdrawals.
            </p>
            {user?.email && (
              <p style={styles.email}>{user.email}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadTransactions(true)}
            disabled={refreshing}
            style={{
              ...styles.refreshButton,
              opacity: refreshing ? 0.65 : 1,
            }}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <strong>Unable to refresh transactions.</strong>
            <p style={{ margin: "6px 0 12px" }}>{error}</p>
            <button
              type="button"
              onClick={() => loadTransactions()}
              style={styles.retryButton}
            >
              Try again
            </button>
          </div>
        )}

        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryIcon}>📋</span>
            <p style={styles.summaryLabel}>Total Records</p>
            <h2 style={styles.summaryValue}>
              {transactions.length.toLocaleString()}
            </h2>
          </div>

          <div style={styles.summaryCard}>
            <span style={styles.summaryIcon}>🏆</span>
            <p style={styles.summaryLabel}>Recorded Wins</p>
            <h2 style={{ ...styles.summaryValue, color: "#16a34a" }}>
              {formatCoins(totalWins)}
            </h2>
          </div>

          <div style={styles.summaryCard}>
            <span style={styles.summaryIcon}>🪙</span>
            <p style={styles.summaryLabel}>Coins Purchased</p>
            <h2 style={styles.summaryValue}>
              {purchasedCoins.toLocaleString()}
            </h2>
          </div>

          <div style={styles.summaryCard}>
            <span style={styles.summaryIcon}>💸</span>
            <p style={styles.summaryLabel}>Withdrawn Coins</p>
            <h2 style={styles.summaryValue}>
              {completedWithdrawals.toLocaleString()}
            </h2>
          </div>
        </div>

        <div style={styles.filterSection}>
          <h2 style={styles.sectionHeading}>Transaction History</h2>

          <div style={styles.filterList}>
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                style={{
                  ...styles.filterButton,
                  ...(activeFilter === filter.id
                    ? styles.activeFilterButton
                    : {}),
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🧾</div>
            <h3 style={styles.emptyTitle}>No transactions found</h3>
            <p style={styles.emptyText}>
              Your transactions will appear here when you purchase coins,
              play games, win rewards or make a withdrawal.
            </p>

            {activeFilter !== "all" && (
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                style={styles.showAllButton}
              >
                View all transactions
              </button>
            )}
          </div>
        ) : (
          <div style={styles.transactionList}>
            {filteredTransactions.map((transaction) => (
              <div
                key={transaction.id}
                style={styles.transactionCard}
              >
                <div style={styles.transactionIcon}>
                  {getTypeIcon(transaction)}
                </div>

                <div style={styles.transactionInfo}>
                  <div style={styles.transactionTitleRow}>
                    <h3 style={styles.transactionTitle}>
                      {transaction.title}
                    </h3>

                    <span
                      style={{
                        ...styles.statusBadge,
                        color: getStatusColor(transaction.status),
                        backgroundColor:
                          getStatusColor(transaction.status) + "18",
                      }}
                    >
                      {statusLabel(transaction.status)}
                    </span>
                  </div>

                  <p style={styles.transactionDescription}>
                    {transaction.description}
                  </p>

                  <p style={styles.transactionDate}>
                    {formatDate(transaction.date)}
                  </p>
                </div>

                <div style={styles.amountContainer}>
                  <strong
                    style={{
                      ...styles.transactionAmount,
                      color: getAmountColor(transaction),
                    }}
                  >
                    {getAmountText(transaction)}
                  </strong>

                  <span style={styles.amountUnit}>
                    {transaction.unit === "coins"
                      ? "W Coins"
                      : transaction.currency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={styles.footerNote}>
          Transaction history reflects the records currently stored in your
          Win9ja Life account. Pending transactions are not confirmed payments
          or credited rewards.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    background: "#f1f5f9",
    padding: "20px 12px 40px",
    color: "#0f172a",
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  container: {
    width: "100%",
    maxWidth: "1100px",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },

  heading: {
    fontSize: "clamp(25px, 5vw, 34px)",
    lineHeight: 1.2,
    margin: "0 0 8px",
    fontWeight: 800,
    color: "#0f172a",
  },

  subheading: {
    margin: "0 0 5px",
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.6,
  },

  email: {
    margin: 0,
    fontSize: "12px",
    color: "#94a3b8",
    overflowWrap: "anywhere",
  },

  refreshButton: {
    border: "none",
    borderRadius: "10px",
    padding: "11px 15px",
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "13px",
    cursor: "pointer",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: "12px",
    marginBottom: "28px",
  },

  summaryCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "18px 15px",
    minWidth: 0,
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.03)",
  },

  summaryIcon: {
    fontSize: "23px",
  },

  summaryLabel: {
    margin: "12px 0 7px",
    fontSize: "12px",
    color: "#64748b",
    fontWeight: 600,
  },

  summaryValue: {
    margin: 0,
    fontSize: "clamp(17px, 3vw, 22px)",
    lineHeight: 1.4,
    fontWeight: 800,
    color: "#0f172a",
    overflowWrap: "anywhere",
  },

  filterSection: {
    marginBottom: "16px",
  },

  sectionHeading: {
    margin: "0 0 14px",
    fontSize: "20px",
    fontWeight: 800,
    color: "#0f172a",
  },

  filterList: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "8px",
    WebkitOverflowScrolling: "touch",
  },

  filterButton: {
    flex: "0 0 auto",
    border: "1px solid #cbd5e1",
    borderRadius: "999px",
    background: "#ffffff",
    color: "#475569",
    padding: "9px 14px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  activeFilterButton: {
    background: "#16a34a",
    color: "#ffffff",
    borderColor: "#16a34a",
  },

  transactionList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  transactionCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "16px 13px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.025)",
    minWidth: 0,
  },

  transactionIcon: {
    flex: "0 0 42px",
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    background: "#f0fdf4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "21px",
  },

  transactionInfo: {
    flex: "1 1 auto",
    minWidth: 0,
  },

  transactionTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "7px",
  },

  transactionTitle: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 800,
    color: "#0f172a",
    overflowWrap: "anywhere",
  },

  statusBadge: {
    display: "inline-block",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "10px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  transactionDescription: {
    margin: "7px 0",
    fontSize: "12px",
    lineHeight: 1.6,
    color: "#64748b",
    overflowWrap: "anywhere",
  },

  transactionDate: {
    margin: 0,
    fontSize: "11px",
    color: "#94a3b8",
  },

  amountContainer: {
    flex: "0 0 auto",
    maxWidth: "42%",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "5px",
    textAlign: "right",
    overflowWrap: "anywhere",
  },

  transactionAmount: {
    fontSize: "12px",
    lineHeight: 1.5,
    fontWeight: 800,
    overflowWrap: "anywhere",
  },

  amountUnit: {
    fontSize: "10px",
    color: "#94a3b8",
  },

  emptyState: {
    background: "#ffffff",
    border: "1px dashed #cbd5e1",
    borderRadius: "16px",
    padding: "38px 20px",
    textAlign: "center",
  },

  emptyIcon: {
    fontSize: "40px",
    marginBottom: "12px",
  },

  emptyTitle: {
    margin: "0 0 8px",
    fontSize: "18px",
    color: "#0f172a",
  },

  emptyText: {
    maxWidth: "430px",
    margin: "0 auto 18px",
    fontSize: "13px",
    lineHeight: 1.7,
    color: "#64748b",
  },

  showAllButton: {
    border: "none",
    borderRadius: "9px",
    padding: "10px 15px",
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  loadingCard: {
    maxWidth: "400px",
    margin: "80px auto",
    padding: "30px 20px",
    textAlign: "center",
    background: "#ffffff",
    borderRadius: "16px",
    color: "#64748b",
  },

  spinner: {
    width: "30px",
    height: "30px",
    border: "3px solid #dcfce7",
    borderTopColor: "#16a34a",
    borderRadius: "50%",
    margin: "0 auto 15px",
    animation: "win9ja-spin 0.8s linear infinite",
  },

  errorBox: {
    marginBottom: "20px",
    padding: "15px",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: "13px",
    lineHeight: 1.6,
    overflowWrap: "anywhere",
  },

  retryButton: {
    border: "none",
    borderRadius: "8px",
    padding: "9px 13px",
    background: "#b91c1c",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  footerNote: {
    margin: "22px 0 0",
    color: "#94a3b8",
    fontSize: "11px",
    lineHeight: 1.7,
    textAlign: "center",
  },
};

if (typeof document !== "undefined" && !document.getElementById("win9ja-transactions-animation")) {
  const styleElement = document.createElement("style");
  styleElement.id = "win9ja-transactions-animation";
  styleElement.textContent = `
    @keyframes win9ja-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleElement);
}