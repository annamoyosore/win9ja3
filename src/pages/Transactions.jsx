import { useEffect, useState } from "react";

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

const styles = {
container: {
padding: 20,
minHeight: "100vh",
background: "#020617",
color: "#fff",
boxSizing: "border-box",
fontFamily: "Arial, sans-serif",
},
header: {
display: "flex",
alignItems: "center",
justifyContent: "space-between",
flexWrap: "wrap",
gap: 12,
marginBottom: 20,
},
title: {
fontSize: 26,
marginBottom: 15,
color: "gold",
},
summary: {
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
gap: 10,
marginBottom: 20,
},
summaryCard: {
background: "#111827",
padding: 14,
borderRadius: 12,
border: "1px solid #273449",
},
summaryLabel: {
color: "#94a3b8",
fontSize: 12,
},
summaryValue: {
display: "block",
marginTop: 8,
fontSize: 20,
color: "#4ade80",
},
filters: {
display: "flex",
gap: 8,
overflowX: "auto",
paddingBottom: 12,
marginBottom: 12,
},
filter: {
padding: "9px 13px",
border: "1px solid #334155",
borderRadius: 20,
background: "#111827",
color: "#fff",
cursor: "pointer",
whiteSpace: "nowrap",
},
activeFilter: {
background: "#166534",
borderColor: "#22c55e",
},
card: {
background: "#111827",
padding: 15,
borderRadius: 12,
marginBottom: 10,
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: 12,
border: "1px solid #1f2937",
},
titleText: {
fontWeight: "bold",
margin: "0 0 7px",
overflowWrap: "anywhere",
},
detail: {
fontSize: 12,
color: "#94a3b8",
margin: "4px 0",
overflowWrap: "anywhere",
},
date: {
fontSize: 11,
color: "#64748b",
marginTop: 7,
},
right: {
textAlign: "right",
flexShrink: 0,
},
amount: {
fontWeight: "bold",
margin: "0 0 7px",
fontSize: 14,
},
status: {
display: "inline-block",
fontSize: 11,
padding: "5px 8px",
borderRadius: 20,
background: "#334155",
color: "#e2e8f0",
},
empty: {
opacity: 0.7,
textAlign: "center",
padding: 25,
},
error: {
background: "#451a1a",
border: "1px solid #991b1b",
padding: 12,
borderRadius: 10,
color: "#fecaca",
marginBottom: 15,
},
back: {
marginTop: 20,
padding: 12,
background: "#475569",
border: "none",
borderRadius: 10,
color: "#fff",
width: "100%",
cursor: "pointer",
},
refresh: {
padding: "10px 14px",
background: "#1d4ed8",
border: "none",
borderRadius: 9,
color: "#fff",
cursor: "pointer",
},
loading: {
minHeight: "100vh",
display: "flex",
flexDirection: "column",
justifyContent: "center",
alignItems: "center",
background: "#020617",
color: "#fff",
},
};

function formatDate(value) {
if (!value) return "Date unavailable";

const date = new Date(value);

return Number.isNaN(date.getTime())
? "Date unavailable"
: date.toLocaleString();
}

function formatCoins(value) {
const amount = Number(value || 0);

return "${amount > 0 ? "+" : ""}${amount.toLocaleString()} coins";
}

function formatMoney(value, currency = "NGN") {
const amount = Number(value || 0);

try {
return new Intl.NumberFormat("en", {
style: "currency",
currency,
maximumFractionDigits: 2,
}).format(amount);
} catch {
return "${currency} ${amount.toLocaleString()}";
}
}

function normalizeStatus(value) {
return String(value || "pending").toLowerCase();
}

function statusColor(status) {
switch (normalizeStatus(status)) {
case "approved":
case "paid":
case "completed":
case "finished":
case "success":
return "#22c55e";

case "rejected":
case "failed":
case "lost":
  return "#ef4444";

case "pending":
case "waiting":
case "matched":
case "running":
  return "#facc15";

default:
  return "#94a3b8";

}
}

export default function Transactions({ back }) {
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [filter, setFilter] = useState("All");
const [refreshKey, setRefreshKey] = useState(0);

useEffect(() => {
let active = true;

async function fetchAll(collection, queries = []) {
  const all = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const result = await databases.listDocuments(
      DATABASE_ID,
      collection,
      [
        ...queries,
        Query.limit(limit),
        Query.offset(offset),
      ]
    );

    all.push(...result.documents);

    if (result.documents.length < limit) break;

    offset += limit;
  }

  return all;
}

async function loadActivity() {
  try {
    setLoading(true);
    setError("");

    const user = await account.get();

    // =========================
    // WHOT MATCHES
    // =========================

    const [hostMatches, opponentMatches] =
      await Promise.all([
        fetchAll(MATCH_COLLECTION, [
          Query.equal("hostId", user.$id),
        ]),
        fetchAll(MATCH_COLLECTION, [
          Query.equal("opponentId", user.$id),
        ]),
      ]);

    const matchMap = new Map();

    [...hostMatches, ...opponentMatches].forEach((match) => {
      matchMap.set(match.$id, match);
    });

    const matches = Array.from(matchMap.values());

    const matchList = await Promise.all(
      matches.map(async (match) => {
        const status = normalizeStatus(match.status);

        let winnerId = match.winnerId || null;

        if (!winnerId && match.gameId) {
          try {
            const game = await databases.getDocument(
              DATABASE_ID,
              GAME_COLLECTION,
              match.gameId
            );

            winnerId = game.winnerId || null;
          } catch {
            // Some matches may not have a separate game document.
          }
        }

        const stake = Number(match.stake || 0);

        if (
          status === "waiting" ||
          status === "matched" ||
          status === "running"
        ) {
          return {
            id: `match_${match.$id}`,
            category: "Games",
            title: "Game in progress",
            amount: -stake,
            unit: "coins",
            color: "#facc15",
            status,
            createdAt: match.$createdAt,
            detail: "Stake amount; not a final result.",
          };
        }

        if (status === "finished") {
          if (winnerId === user.$id) {
            /*
             * payoutAmount should be saved by the payout
             * code before the match pot is cleared.
             *
             * Older matches may not contain payoutAmount.
             * Do not claim a zero payout if it is unavailable.
             */
            const hasPayout =
              match.payoutAmount !== undefined &&
              match.payoutAmount !== null;

            const payout = hasPayout
              ? Number(match.payoutAmount)
              : Number(match.pot || 0);

            return {
              id: `match_${match.$id}`,
              category: "Games",
              title: "Whot — Game Won",
              amount: payout,
              unit: "coins",
              color: "#22c55e",
              status: "finished",
              createdAt: match.$updatedAt || match.$createdAt,
              detail: hasPayout
                ? "Recorded winner payout."
                : payout > 0
                ? "Payout read from the match pot."
                : "Historical payout unavailable. Check the wallet or original match record.",
            };
          }

          if (winnerId) {
            return {
              id: `match_${match.$id}`,
              category: "Games",
              title: "Whot — Game Lost",
              amount: -stake,
              unit: "coins",
              color: "#ef4444",
              status: "finished",
              createdAt: match.$updatedAt || match.$createdAt,
              detail: "Stake lost.",
            };
          }

          return {
            id: `match_${match.$id}`,
            category: "Games",
            title: "Whot — Match Finished",
            amount: 0,
            unit: "coins",
            color: "#facc15",
            status: "finished",
            createdAt: match.$updatedAt || match.$createdAt,
            detail: "Winner information is unavailable.",
          };
        }

        return {
          id: `match_${match.$id}`,
          category: "Games",
          title: "Match Update",
          amount: 0,
          unit: "coins",
          color: "#94a3b8",
          status,
          createdAt: match.$createdAt,
          detail: "No final result recorded.",
        };
      })
    );

    // =========================
    // CASINO ACTIVITY
    // =========================

    const casinoRecords = await fetchAll(
      CASINO_COLLECTION,
      [Query.equal("userId", user.$id)]
    );

    const casinoList = casinoRecords.map((record) => {
      const outcome = String(record.result || "unknown");
      const win = Number(record.win || 0);
      const stake = Number(record.stake || 0);

      let net = win - stake;
      let title = `Casino — ${outcome}`;
      let color = "#facc15";

      if (outcome.toUpperCase() === "FREE") {
        title = "Casino — Free Spin";
        net = 0;
        color = "#a78bfa";
      } else if (outcome.toUpperCase() === "ALMOST") {
        title = "Casino — Almost";
        net = -stake;
        color = "#fb923c";
      } else if (win > stake) {
        title = `Casino — Won (${outcome})`;
        color = "#22c55e";
      } else if (win > 0 && win === stake) {
        title = `Casino — Stake Returned (${outcome})`;
        color = "#facc15";
      } else {
        title = `Casino — Lost (${outcome})`;
        net = -stake;
        color = "#ef4444";
      }

      return {
        id: `casino_${record.$id}`,
        category: "Casino",
        title,
        amount: net,
        unit: "coins",
        color,
        status: outcome,
        createdAt: record.$createdAt,
        detail: `Stake: ${stake.toLocaleString()} coins. Recorded win: ${win.toLocaleString()} coins.`,
      };
    });

    // =========================
    // COIN PURCHASES / DEPOSITS
    // =========================

    const depositRecords = await fetchAll(
      DEPOSIT_COLLECTION,
      [Query.equal("userId", user.$id)]
    );

    const depositList = depositRecords.map((deposit) => {
      const status = normalizeStatus(deposit.status);
      const coins = Number(deposit.coins || 0);
      const currency = deposit.currency || "NGN";
      const isCoinPurchase = coins > 0;

      let title = "Deposit Pending";
      let color = "#facc15";

      if (status === "approved" || status === "paid" || status === "completed") {
        title = isCoinPurchase
          ? "Coin Purchase Approved"
          : "Deposit Successful";
        color = "#22c55e";
      } else if (status === "rejected" || status === "failed") {
        title = isCoinPurchase
          ? "Coin Purchase Rejected"
          : "Deposit Failed";
        color = "#ef4444";
      } else if (isCoinPurchase) {
        title = "Coin Purchase Pending";
      }

      return {
        id: `dep_${deposit.$id}`,
        category: isCoinPurchase ? "Coin Purchases" : "Deposits",
        title,
        /*
         * A coin purchase is shown as coins received only when
         * approved. Pending/rejected purchases show the payment
         * amount separately and do not claim coins were credited.
         */
        amount:
          isCoinPurchase && status === "approved"
            ? coins
            : 0,
        unit:
          isCoinPurchase && status === "approved"
            ? "coins"
            : "money",
        moneyAmount: Number(deposit.amount || 0),
        currency,
        color,
        status,
        createdAt: deposit.$createdAt,
        detail: isCoinPurchase
          ? `${formatMoney(deposit.amount, currency)} payment · ${coins.toLocaleString()} coins requested`
          : `${formatMoney(deposit.amount, currency)} deposit request`,
      };
    });

    // =========================
    // COIN WITHDRAWALS
    // =========================

    const withdrawalRecords = await fetchAll(
      WITHDRAW_COLLECTION,
      [Query.equal("userId", user.$id)]
    );

    const withdrawalList = withdrawalRecords.map((withdrawal) => {
      const status = normalizeStatus(withdrawal.status);

      const coins = Number(
        withdrawal.coins ?? withdrawal.amount ?? 0
      );

      let title = "Coin Withdrawal Pending";
      let color = "#facc15";
      let amount = 0;

      if (status === "paid") {
        title = "Coin Withdrawal Completed";
        color = "#ef4444";
        amount = -coins;
      } else if (status === "rejected") {
        title = "Coin Withdrawal Rejected";
        color = "#94a3b8";
      } else if (status === "approved") {
        title = "Coin Withdrawal Approved — Awaiting Payment";
        color = "#facc15";
      }

      return {
        id: `wd_${withdrawal.$id}`,
        category: "Withdrawals",
        title,
        amount,
        unit: "coins",
        color,
        status,
        createdAt: withdrawal.$updatedAt || withdrawal.$createdAt,
        detail: `${coins.toLocaleString()} coins requested. Status: ${status}.`,
      };
    });

    // =========================
    // MERGE AND SORT
    // =========================

    const merged = [
      ...matchList,
      ...casinoList,
      ...depositList,
      ...withdrawalList,
    ].sort(
      (a, b) =>
        new Date(b.createdAt || 0) -
        new Date(a.createdAt || 0)
    );

    if (active) {
      setData(merged);
    }
  } catch (err) {
    console.error("Activity loading error:", err);

    if (active) {
      setError(
        "Unable to load your activity. Please check your connection and try again."
      );
    }
  } finally {
    if (active) {
      setLoading(false);
    }
  }
}

loadActivity();

return () => {
  active = false;
};

}, [refreshKey]);

const filters = [
"All",
"Games",
"Casino",
"Coin Purchases",
"Withdrawals",
"Deposits",
];

const visibleData =
filter === "All"
? data
: data.filter((item) => item.category === filter);

const wins = data.filter(
(item) =>
item.unit === "coins" &&
item.amount > 0 &&
(item.category === "Games" || item.category === "Casino")
);

const totalRecordedWins = wins.reduce(
(total, item) => total + item.amount,
0
);

const completedPurchases = data.filter(
(item) =>
item.category === "Coin Purchases" &&
item.status === "approved"
);

const totalPurchasedCoins = completedPurchases.reduce(
(total, item) => total + item.amount,
0
);

if (loading) {
return (
<div style={styles.loading}>
<h2>📊 Activity</h2>
<p>Loading your transactions...</p>
</div>
);
}

return (
<div style={styles.container}>
<div style={styles.header}>
<h1 style={styles.title}>📊 Activity</h1>

    <button
      style={styles.refresh}
      onClick={() => {
        setLoading(true);
        setRefreshKey((value) => value + 1);
      }}
    >
      Refresh
    </button>
  </div>

  {error && <div style={styles.error}>{error}</div>}

  <div style={styles.summary}>
    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>Activity records</span>
      <strong style={styles.summaryValue}>
        {data.length.toLocaleString()}
      </strong>
    </div>

    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>Recorded game/casino wins</span>
      <strong style={styles.summaryValue}>
        {totalRecordedWins.toLocaleString()}
      </strong>
      <span style={styles.summaryLabel}>Coins</span>
    </div>

    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>Approved purchased coins</span>
      <strong style={styles.summaryValue}>
        {totalPurchasedCoins.toLocaleString()}
      </strong>
      <span style={styles.summaryLabel}>Coins</span>
    </div>
  </div>

  <div style={styles.filters}>
    {filters.map((item) => (
      <button
        key={item}
        style={{
          ...styles.filter,
          ...(filter === item ? styles.activeFilter : {}),
        }}
        onClick={() => setFilter(item)}
      >
        {item}
      </button>
    ))}
  </div>

  {visibleData.length === 0 && (
    <p style={styles.empty}>
      {error
        ? "Activity could not be loaded."
        : "No activity found in this category."}
    </p>
  )}

  {visibleData.map((item) => {
    let amountText = "—";

    if (item.unit === "coins") {
      amountText = formatCoins(item.amount);
    } else if (item.unit === "money") {
      amountText = formatMoney(
        item.moneyAmount,
        item.currency || "NGN"
      );
    }

    return (
      <div key={item.id} style={styles.card}>
        <div style={{ minWidth: 0 }}>
          <p style={styles.titleText}>{item.title}</p>

          <p style={styles.detail}>
            {item.category}
          </p>

          {item.detail && (
            <p style={styles.detail}>{item.detail}</p>
          )}

          <p style={styles.date}>
            {formatDate(item.createdAt)}
          </p>
        </div>

        <div style={styles.right}>
          <p
            style={{
              ...styles.amount,
              color: item.color || "#fff",
            }}
          >
            {amountText}
          </p>

          <span
            style={{
              ...styles.status,
              color: statusColor(item.status),
            }}
          >
            {item.status || "unknown"}
          </span>
        </div>
      </div>
    );
  })}

  <button style={styles.back} onClick={back}>
    ← Back
  </button>
</div>

);
}