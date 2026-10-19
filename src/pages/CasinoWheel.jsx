import { useEffect, useRef, useState } from "react";
import {
  ,
  DATABASE_ID,
  WALLET_COLLECTION,
  CASINO_COLLECTION,
  account,
} from "../lib/appwrite";
import { ID, Query } from "appwrite";

// ========================================
// CONFIGURATION
// ========================================

const ADMIN_WALLET_ID = "69f2482600125d496354";
const MIN_BET = 50;
const SPIN_DURATION = 5500;
const SEGMENT_ANGLE = 45;

// ========================================
// WHEEL SEGMENTS
// ========================================

const SEGMENTS = [
  { label: "LOSE", type: "LOSE", color: "#ef4444" },       // 50%
  { label: "X2", type: "X2", color: "#22c55e" },           // 10%
  { label: "FREE", type: "FREE", color: "#3b82f6" },       // 10%
  { label: "X3", type: "X3", color: "#a855f7" },           // 5%
  { label: "LOSE", type: "LOSE2", color: "#ef4444" },      // 10%
  { label: "X1", type: "X1", color: "#f59e0b" },           // 10%
  { label: "ALMOST", type: "ALMOST", color: "#fb923c" },   // 5%
  { label: "JACKPOT", type: "JACKPOT", color: "#eab308" }, // 0%
];

// ========================================
// LANDING PROBABILITIES
// ========================================

function getResult() {
  const random = Math.random() * 100;

  if (random < 50) {
    return { index: 0, segment: SEGMENTS[0] };
  }

  if (random < 60) {
    return { index: 1, segment: SEGMENTS[1] };
  }

  if (random < 70) {
    return { index: 2, segment: SEGMENTS[2] };
  }

  if (random < 75) {
    return { index: 3, segment: SEGMENTS[3] };
  }

  if (random < 85) {
    return { index: 4, segment: SEGMENTS[4] };
  }

  if (random < 95) {
    return { index: 5, segment: SEGMENTS[5] };
  }

  return { index: 6, segment: SEGMENTS[6] };
}

// ========================================
// HELPERS
// ========================================

function formatCoins(value) {
  return Number(value || 0).toLocaleString("en-NG");
}

function calculateWinnings(outcome, bet) {
  switch (outcome) {
    case "X1":
      return bet;

    case "X2":
      return bet * 2;

    case "X3":
      return bet * 3;

    case "FREE":
      return bet;

    case "LOSE":
    case "LOSE2":
    case "ALMOST":
    case "JACKPOT":
    default:
      return 0;
  }
}

function getOutcomeMessage(outcome, win) {
  switch (outcome) {
    case "LOSE":
    case "LOSE2":
      return "😔 You lose! Better luck next time.";

    case "X1":
      return `🪙 X1! ${formatCoins(win)} coins returned.`;

    case "X2":
      return `🎉 X2! You received ${formatCoins(win)} gold coins!`;

    case "X3":
      return `🔥 X3! You received ${formatCoins(win)} gold coins!`;

    case "FREE":
      return "🛡️ FREE! Your stake has been returned.";

    case "ALMOST":
      return "😬 Almost, try again! You lost your stake.";

    case "JACKPOT":
      return "Jackpot is unavailable.";

    default:
      return "Spin completed.";
  }
}

// ========================================
// COMPONENT
// ========================================

export default function CasinoWheel() {
  const [wallet, setWallet] = useState(null);
  const [stake, setStake] = useState("50");

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(true);

  const [result, setResult] = useState("");
  const [won, setWon] = useState(0);
  const [lastSegment, setLastSegment] = useState(null);
  const [error, setError] = useState("");

  const spinDataRef = useRef(null);
  const timeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);

  // ========================================
  // LOAD WALLET
  // ========================================

  useEffect(() => {
    mountedRef.current = true;

    async function loadWallet() {
      try {
        const user = await account.get();

        const response = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal("userId", user.$id),
            Query.limit(1),
          ]
        );

        if (!response.documents.length) {
          throw new Error("Your coin wallet was not found.");
        }

        if (mountedRef.current) {
          setWallet(response.documents[0]);
        }
      } catch (err) {
        console.error("Wallet loading error:", err);

        if (mountedRef.current) {
          setError(
            err.message || "Unable to load your coin wallet."
          );
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    loadWallet();

    return () => {
      mountedRef.current = false;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // ========================================
  // UPDATE PLAYER WALLET
  // ========================================

  async function updatePlayerCoins(walletId, coins) {
    const updatedWallet = await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      walletId,
      { coins }
    );

    if (mountedRef.current) {
      setWallet(updatedWallet);
    }

    return updatedWallet;
  }

  // ========================================
  // SAVE HISTORY
  // ========================================

  async function saveHistory({
    userId,
    bet,
    win,
    outcome,
  }) {
    try {
      await databases.createDocument(
        DATABASE_ID,
        CASINO_COLLECTION,
        ID.unique(),
        {
          userId,
          stake: bet,
          win,
          result: outcome,
          createdAt: new Date().toISOString(),
        }
      );
    } catch (err) {
      console.error("Casino history error:", err);
    }
  }

  // ========================================
  // UPDATE CASINO ACCOUNTING
  // ========================================

  async function updateCasinoAccounting(bet, win) {
    try {
      const admin = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID
      );

      const reserve = Number(admin.casinoReserve || 0);
      const profit = Number(admin.casinoProfit || 0);

      // Do not close the casino when its reserve runs out.
      // This accounting update does not block the player's spin.

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        ADMIN_WALLET_ID,
        {
          casinoReserve: reserve - win,
          casinoProfit: profit + bet - win,
        }
      );
    } catch (err) {
      console.error("Casino accounting error:", err);
    }
  }

  // ========================================
  // CALCULATE WHEEL ROTATION
  // ========================================

  function calculateRotation(segmentIndex) {
    /*
      Each segment occupies 45 degrees.

      Segment centre:
      index * 45 + 22.5 degrees.

      The pointer stays at the top.
      Rotate the wheel until the selected segment's
      centre aligns directly under the pointer.
    */

    const segmentCenter =
      segmentIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;

    const targetAngle = (360 - segmentCenter) % 360;

    const currentAngle = ((rotation % 360) + 360) % 360;

    const alignment =
      (targetAngle - currentAngle + 360) % 360;

    const fullRotations = 6 + Math.floor(Math.random() * 3);

    return rotation + fullRotations * 360 + alignment;
  }

  // ========================================
  // START SPIN
  // ========================================

  async function spin() {
    if (busyRef.current || loading) return;

    setError("");
    setResult("");
    setWon(0);
    setLastSegment(null);

    const bet = Number(stake);

    if (!Number.isFinite(bet) || bet < MIN_BET) {
      setError(`Minimum stake is ${MIN_BET} gold coins.`);
      return;
    }

    if (!Number.isSafeInteger(bet)) {
      setError("Enter a whole number of gold coins.");
      return;
    }

    if (!wallet) {
      setError("Your wallet is not available. Refresh and try again.");
      return;
    }

    // Read the latest player wallet before deducting coins.
    busyRef.current = true;
    setSpinning(true);

    let latestWallet;

    try {
      latestWallet = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id
      );

      const availableCoins = Number(latestWallet.coins || 0);

      if (availableCoins < bet) {
        setError("Insufficient gold coins in your wallet.");
        busyRef.current = false;
        setSpinning(false);
        return;
      }

      const deductedCoins = availableCoins - bet;

      // Deduct the stake before spinning.
      const updatedWallet = await updatePlayerCoins(
        latestWallet.$id,
        deductedCoins
      );

      // Select a result using the exact requested probabilities.
      // Jackpot is never selected.
      const selected = getResult();

      const finalRotation = calculateRotation(selected.index);

      spinDataRef.current = {
        index: selected.index,
        segment: selected.segment,
        outcome: selected.segment.type,
        bet,
        userId: latestWallet.userId,
        walletId: updatedWallet.$id,
      };

      setRotation(finalRotation);

      timeoutRef.current = setTimeout(() => {
        finishSpin();
      }, SPIN_DURATION);
    } catch (err) {
      console.error("Spin start error:", err);

      /*
        If the stake deduction succeeded but a later operation
        failed, do not silently leave the player out of coins.
      */

      if (latestWallet) {
        try {
          const refreshed = await databases.getDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            latestWallet.$id
          );

          if (mountedRef.current) {
            setWallet(refreshed);
          }
        } catch (refreshError) {
          console.error("Wallet refresh error:", refreshError);
        }
      }

      if (mountedRef.current) {
        setError(
          "Unable to start the spin. Check your wallet balance before trying again."
        );
        setSpinning(false);
      }

      busyRef.current = false;
    }
  }

  // ========================================
  // FINISH SPIN
  // ========================================

  async function finishSpin() {
    const spinData = spinDataRef.current;

    if (!spinData) {
      busyRef.current = false;

      if (mountedRef.current) {
        setSpinning(false);
      }

      return;
    }

    // Prevent duplicate processing.
    spinDataRef.current = null;

    const {
      outcome,
      segment,
      bet,
      userId,
      walletId,
    } = spinData;

    const win = calculateWinnings(outcome, bet);

    try {
      // Read the latest balance after the stake deduction.
      const latestWallet = await databases.getDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        walletId
      );

      const currentCoins = Number(latestWallet.coins || 0);

      // LOSE and ALMOST have win = 0.
      // Their stake remains deducted.
      const finalCoins = currentCoins + win;

      const updatedWallet = await updatePlayerCoins(
        walletId,
        finalCoins
      );

      if (!mountedRef.current) return;

      setWon(win);
      setLastSegment(segment);
      setResult(getOutcomeMessage(outcome, win));

      setWallet(updatedWallet);

      await saveHistory({
        userId: userId || latestWallet.userId || walletId,
        bet,
        win,
        outcome,
      });

      await updateCasinoAccounting(bet, win);
    } catch (err) {
      console.error("Spin payout error:", err);

      if (mountedRef.current) {
        setError(
          "We could not confirm the payout. Please check your coin balance before spinning again."
        );
      }
    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setSpinning(false);
      }
    }
  }

  // ========================================
  // WHEEL COLOUR GRADIENT
  // ========================================

  const wheelBackground = `conic-gradient(from 0deg, ${
    SEGMENTS.map((segment, index) => {
      const start = index * SEGMENT_ANGLE;
      const end = (index + 1) * SEGMENT_ANGLE;

      return `${segment.color} ${start}deg ${end}deg`;
    }).join(", ")
  })`;

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <div style={styles.container}>
        <h2>🎡 Casino Wheel</h2>
        <p>Loading your gold coins...</p>
      </div>
    );
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>🎡 Casino Wheel</h2>

      <p style={styles.subtitle}>
        Spin the wheel and win gold coins!
      </p>

      {/* WALLET */}

      <div style={styles.walletBox}>
        <span>🪙 Your Gold Coins</span>

        <strong style={styles.balance}>
          {formatCoins(wallet?.coins)}
        </strong>
      </div>

      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* POINTER */}

      <div style={styles.pointerArea}>
        <div style={styles.pointer} />
      </div>

      {/* WHEEL */}

      <div style={styles.wheelContainer}>
        <div
          style={{
            ...styles.wheel,
            background: wheelBackground,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_DURATION}ms cubic-bezier(0.12, 0.75, 0.15, 1)`
              : "none",
          }}
        >
          {SEGMENTS.map((segment, index) => {
            const angle = index * SEGMENT_ANGLE + 22.5;

            return (
              <div
                key={`${segment.type}-${index}`}
                style={{
                  ...styles.segmentLabel,
                  transform: `
                    rotate(${angle}deg)
                    translateY(-86px)
                    rotate(-${angle}deg)
                  `,
                }}
              >
                {segment.label}
              </div>
            );
          })}

          <div style={styles.centre}>
            🪙
          </div>
        </div>
      </div>

      {/* STAKE */}

      <div style={styles.stakeArea}>
        <label htmlFor="casino-stake">
          Stake gold coins
        </label>

        <input
          id="casino-stake"
          type="number"
          min={MIN_BET}
          step="1"
          value={stake}
          disabled={spinning}
          onChange={(event) => setStake(event.target.value)}
          placeholder={`Minimum ${MIN_BET} coins`}
          style={styles.input}
        />

        <div style={styles.quickBets}>
          {[50, 100, 200, 500].map((amount) => (
            <button
              type="button"
              key={amount}
              disabled={spinning}
              onClick={() => setStake(String(amount))}
              style={styles.quickBet}
            >
              {amount}
            </button>
          ))}
        </div>
      </div>

      {/* SPIN BUTTON */}

      <button
        type="button"
        onClick={spin}
        disabled={spinning || loading || !wallet}
        style={{
          ...styles.spinButton,
          opacity: spinning || !wallet ? 0.6 : 1,
        }}
      >
        {spinning ? "🎡 SPINNING..." : "🎯 SPIN NOW"}
      </button>

      <p style={styles.minimum}>
        Minimum stake: {MIN_BET} gold coins
      </p>

      {/* RESULT */}

      {result && (
        <div style={styles.resultBox}>
          <h3>{result}</h3>

          {lastSegment && (
            <p>
              Stopped on:{" "}
              <strong style={{ color: lastSegment.color }}>
                {lastSegment.label}
              </strong>
            </p>
          )}

          <p>
            Coins received:{" "}
            <strong>{formatCoins(won)}</strong>
          </p>

          <p>
            Current balance:{" "}
            <strong>{formatCoins(wallet?.coins)} coins</strong>
          </p>
        </div>
      )}

      {/* PROBABILITY GUIDE */}

      <div style={styles.rules}>
        <h3>🎯 Wheel Odds</h3>

        <div style={styles.ruleRow}>
          <span>🔴 LOSE</span>
          <strong>50%</strong>
        </div>

        <div style={styles.ruleRow}>
          <span>🟢 X2</span>
          <strong>10%</strong>
        </div>

        <div style={styles.ruleRow}>
          <span>🔵 FREE</span>
          <strong>10%</strong>
        </div>

        <div style={styles.ruleRow}>
          <span>🟣 X3</span>
          <strong>5%</strong>
        </div>

        <div style={styles.ruleRow}>
          <span>🔴 LOSE</span>
          <strong>10%</strong>
        </div>

        <div style={styles.ruleRow}>
          <span>🟠 X1</span>
          <strong>10%</strong>
        </div>

        <div style={styles.ruleRow}>
          <span>😬 ALMOST</span>
          <strong>5%</strong>
        </div>

        <div style={styles.ruleRow}>
          <span>💎 JACKPOT</span>
          <strong>0%</strong>
        </div>
      </div>

      <p style={styles.footer}>
        All game results use gold coins, not naira.
      </p>
    </div>
  );
}

// ========================================
// STYLES
// ========================================

const styles = {
  container: {
    width: "100%",
    maxWidth: "480px",
    margin: "0 auto",
    padding: "20px 14px",
    boxSizing: "border-box",
    textAlign: "center",
    color: "#ffffff",
    background: "#111827",
    borderRadius: "16px",
    fontFamily: "Arial, sans-serif",
  },

  heading: {
    margin: "0 0 8px",
    color: "#facc15",
    fontSize: "26px",
  },

  subtitle: {
    color: "#d1d5db",
    fontSize: "14px",
    marginBottom: "20px",
  },

  walletBox: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    padding: "15px",
    marginBottom: "20px",
    borderRadius: "12px",
    background: "#1f2937",
    border: "1px solid #4b5563",
  },

  balance: {
    color: "#facc15",
    fontSize: "25px",
  },

  error: {
    padding: "12px",
    margin: "12px 0",
    borderRadius: "8px",
    background: "#7f1d1d",
    color: "#fecaca",
    overflowWrap: "anywhere",
  },

  pointerArea: {
    height: "27px",
    display: "flex",
    justifyContent: "center",
    position: "relative",
    zIndex: 2,
  },

  pointer: {
    width: 0,
    height: 0,
    borderLeft: "17px solid transparent",
    borderRight: "17px solid transparent",
    borderTop: "30px solid #ffffff",
    filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))",
  },

  wheelContainer: {
    width: "280px",
    height: "280px",
    maxWidth: "100%",
    margin: "0 auto 24px",
    boxSizing: "border-box",
  },

  wheel: {
    width: "100%",
    height: "100%",
    position: "relative",
    borderRadius: "50%",
    border: "8px solid #facc15",
    boxSizing: "border-box",
    overflow: "hidden",
    boxShadow: "0 0 0 3px #92400e, 0 8px 24px rgba(0,0,0,0.4)",
    willChange: "transform",
  },

  segmentLabel: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "76px",
    height: "24px",
    marginLeft: "-38px",
    marginTop: "-12px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "#ffffff",
    fontSize: "10px",
    fontWeight: "900",
    whiteSpace: "nowrap",
    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
    pointerEvents: "none",
  },

  centre: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#111827",
    border: "4px solid #facc15",
    fontSize: "20px",
    zIndex: 1,
  },

  stakeArea: {
    marginTop: "10px",
    textAlign: "left",
  },

  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    marginTop: "8px",
    padding: "13px",
    borderRadius: "8px",
    border: "1px solid #4b5563",
    background: "#1f2937",
    color: "#ffffff",
    fontSize: "17px",
    textAlign: "center",
  },

  quickBets: {
    display: "flex",
    gap: "8px",
    marginTop: "10px",
  },

  quickBet: {
    flex: 1,
    padding: "9px 5px",
    border: "1px solid #4b5563",
    borderRadius: "7px",
    background: "#374151",
    color: "#ffffff",
    fontWeight: "700",
  },

  spinButton: {
    width: "100%",
    marginTop: "18px",
    padding: "16px",
    border: "none",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #facc15, #f59e0b)",
    color: "#111827",
    fontSize: "18px",
    fontWeight: "900",
  },

  minimum: {
    color: "#9ca3af",
    fontSize: "12px",
  },

  resultBox: {
    marginTop: "20px",
    padding: "15px",
    borderRadius: "12px",
    background: "#1f2937",
    border: "1px solid #4b5563",
    overflowWrap: "anywhere",
  },

  rules: {
    marginTop: "24px",
    padding: "15px",
    borderRadius: "10px",
    background: "#1f2937",
    textAlign: "left",
    fontSize: "13px",
  },

  ruleRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "7px 0",
    borderBottom: "1px solid #374151",
  },

  footer: {
    marginTop: "18px",
    color: "#9ca3af",
    fontSize: "12px",
  },
};