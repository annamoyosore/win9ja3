import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

const SNAKE_LOBBY_COLLECTION = "snakelobby";
const SNAKE_GAME_COLLECTION = "snakegame";

const ADMIN_CUT_PERCENT = 12;
const MIN_STAKE = 150;

// =========================
// WALLET FETCH
// =========================
async function getWallet(userId) {
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", userId),
        Query.limit(1)
      ]
    );

    return res.documents?.[0] || null;
  } catch (err) {
    console.error("Wallet fetch failed:", err);
    return null;
  }
}

export default function Snakelobby({ goGame }) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [stake, setStake] = useState("");

  const [waiting, setWaiting] = useState([]);
  const [active, setActive] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(null);
  const [error, setError] = useState("");

  // =========================
  // INITIALIZE
  // =========================
  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);
    setError("");

    try {
      const currentUser = await account.get();

      setUser(currentUser);

      const currentWallet = await getWallet(
        currentUser.$id
      );

      setWallet(currentWallet);

      await loadLobbies(currentUser.$id);
    } catch (err) {
      console.error("Snake lobby initialization failed:", err);

      setError(
        "Unable to open the lobby. Please log in again and retry."
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // REFRESH WALLET
  // =========================
  async function refreshWallet() {
    if (!user?.$id) return null;

    const freshWallet = await getWallet(user.$id);

    setWallet(freshWallet);

    return freshWallet;
  }

  // =========================
  // LOAD LOBBIES
  // =========================
  async function loadLobbies(userId) {
    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        [Query.limit(100)]
      );

      const all = res.documents || [];

      // Public waiting lobbies
      const waitingLobbies = all.filter(
        (lobby) => lobby.status === "waiting"
      );

      // Active games belonging to this user
      const activeGames = all.filter((lobby) => {
        return (
          lobby.status === "matched" &&
          lobby.gameId &&
          (
            lobby.hostId === userId ||
            lobby.opponentId === userId
          )
        );
      });

      setWaiting(waitingLobbies);
      setActive(activeGames);
    } catch (err) {
      console.error("Failed to load Snake lobbies:", err);

      throw err;
    }
  }

  // =========================
  // CREATE LOBBY
  // =========================
  async function createLobby() {
    if (!user?.$id) {
      alert("Please log in before creating a lobby.");
      return;
    }

    const amount = Number(stake);

    if (
      !Number.isSafeInteger(amount) ||
      amount < MIN_STAKE
    ) {
      alert(`Minimum stake is ${MIN_STAKE} coins.`);
      return;
    }

    setLoadingCreate(true);

    let deductedWallet = null;
    let deductionAttempted = false;

    try {
      // Always fetch the latest wallet before spending.
      const freshWallet = await getWallet(user.$id);

      if (!freshWallet) {
        throw new Error("Wallet not found. Please try again.");
      }

      const availableCoins = Number(freshWallet.coins || 0);

      if (availableCoins < amount) {
        throw new Error(
          `Insufficient coins. You have ${availableCoins} coins, but need ${amount}.`
        );
      }

      // Deduct coins from host.
      deductedWallet = freshWallet;
      deductionAttempted = true;

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          coins: availableCoins - amount
        }
      );

      setWallet({
        ...freshWallet,
        coins: availableCoins - amount
      });

      // Create the lobby.
      await databases.createDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          status: "waiting",
          gameId: "",
          pot: amount,
          refundDone: false
        }
      );

      setStake("");

      await refreshWallet();
      await loadLobbies(user.$id);

      alert(
        `${amount} coins have been staked. Your Snake lobby is now open.`
      );
    } catch (err) {
      console.error("Create Snake lobby failed:", err);

      // Best-effort refund if the coins were deducted but
      // the lobby could not be created.
      if (deductionAttempted && deductedWallet) {
        try {
          const latestWallet = await getWallet(user.$id);

          if (latestWallet) {
            await databases.updateDocument(
              DATABASE_ID,
              WALLET_COLLECTION,
              latestWallet.$id,
              {
                coins:
                  Number(latestWallet.coins || 0) +
                  Number(deductedWallet.coins || 0) -
                  Number(
                    deductedWallet.coins || 0
                  ) +
                  amount
              }
            );
          }
        } catch (refundError) {
          console.error(
            "Automatic refund failed. Please inspect the wallet:",
            refundError
          );

          alert(
            "The lobby could not be created and an automatic refund failed. Please contact support before trying again."
          );
        }
      }

      await refreshWallet();

      alert(
        err.message ||
          "Could not create the lobby. Please try again."
      );
    } finally {
      setLoadingCreate(false);
    }
  }

  // =========================
  // JOIN LOBBY
  // =========================
  async function joinLobby(lobby) {
    if (!user?.$id) {
      alert("Please log in before joining a lobby.");
      return;
    }

    if (loadingJoin) return;

    setLoadingJoin(lobby.$id);

    let opponentWallet = null;
    let opponentDeductionAttempted = false;
    let opponentAmount = 0;

    let matchedLobby = null;
    let game = null;

    try {
      // Read the latest lobby.
      const fresh = await databases.getDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        lobby.$id
      );

      if (fresh.hostId === user.$id) {
        throw new Error("You cannot join your own lobby.");
      }

      if (fresh.status !== "waiting" || fresh.opponentId) {
        throw new Error(
          "This lobby is no longer available. Refresh and try another."
        );
      }

      const amount = Number(fresh.stake || 0);

      if (
        !Number.isSafeInteger(amount) ||
        amount < MIN_STAKE
      ) {
        throw new Error("This lobby has an invalid stake.");
      }

      // Get the latest opponent wallet.
      const freshWallet = await getWallet(user.$id);

      if (!freshWallet) {
        throw new Error("Wallet not found.");
      }

      const availableCoins = Number(
        freshWallet.coins || 0
      );

      if (availableCoins < amount) {
        throw new Error(
          `Insufficient coins. You have ${availableCoins} coins, but need ${amount}.`
        );
      }

      // Deduct opponent's coins.
      opponentWallet = freshWallet;
      opponentAmount = amount;
      opponentDeductionAttempted = true;

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          coins: availableCoins - amount
        }
      );

      setWallet({
        ...freshWallet,
        coins: availableCoins - amount
      });

      // Match the lobby.
      matchedLobby = await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched"
        }
      );

      // Calculate the final prize pot.
      const total = amount * 2;

      const adminCut = Math.floor(
        (total * ADMIN_CUT_PERCENT) / 100
      );

      const finalPot = total - adminCut;

      // Create the game.
      game = await databases.createDocument(
        DATABASE_ID,
        SNAKE_GAME_COLLECTION,
        ID.unique(),
        {
          lobbyId: matchedLobby.$id,
          hostId: matchedLobby.hostId,
          opponentId: user.$id,
          status: "running",
          turn: matchedLobby.hostId,
          pot: finalPot,
          payoutDone: false
        }
      );

      // Attach the game to the lobby.
      await databases.updateDocument(
        DATABASE_ID,
        SNAKE_LOBBY_COLLECTION,
        matchedLobby.$id,
        {
          gameId: game.$id
        }
      );

      await refreshWallet();
      await loadLobbies(user.$id);

      // Open the game.
      if (typeof goGame !== "function") {
        throw new Error(
          "Game navigation is unavailable. Please return to the lobby and resume the game."
        );
      }

      goGame(game.$id, amount);
    } catch (err) {
      console.error("Join Snake lobby failed:", err);

      // Important: do not blindly refund here if a game or match
      // was already created. That requires checking the actual
      // lobby/game state to avoid creating duplicate refunds.
      await refreshWallet();

      if (!matchedLobby && opponentDeductionAttempted && opponentWallet) {
        try {
          const latestWallet = await getWallet(user.$id);

          if (latestWallet) {
            await databases.updateDocument(
              DATABASE_ID,
              WALLET_COLLECTION,
              latestWallet.$id,
              {
                coins:
                  Number(latestWallet.coins || 0) +
                  opponentAmount
              }
            );
          }
        } catch (refundError) {
          console.error(
            "Opponent refund failed:",
            refundError
          );

          alert(
            "The join operation failed and the refund could not be completed automatically. Please contact support."
          );
        }
      }

      alert(
        err.message ||
          "Could not join the game. Please try again."
      );

      try {
        await loadLobbies(user.$id);
      } catch (refreshError) {
        console.error(refreshError);
      }
    } finally {
      setLoadingJoin(null);
    }
  }

  // =========================
  // UI
  // =========================
  if (loading) {
    return (
      <div style={styles.container}>
        <h2>🐍 Snake & Ladder</h2>
        <p>Loading lobby...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <h2>🐍 Snake & Ladder</h2>
        <p>{error || "Please log in to continue."}</p>

        <button
          style={styles.button}
          onClick={init}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2>🐍 Snake & Ladder Lobby</h2>

      <div style={styles.walletCard}>
        <span>🪙 Your Gold Coins</span>

        <strong>
          {Number(wallet?.coins || 0).toLocaleString()}
        </strong>
      </div>

      <div style={styles.createBox}>
        <input
          style={styles.input}
          type="number"
          min={MIN_STAKE}
          step="1"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          placeholder={`Stake in coins (min ${MIN_STAKE})`}
        />

        <button
          style={styles.button}
          onClick={createLobby}
          disabled={loadingCreate}
        >
          {loadingCreate
            ? "Creating..."
            : "Create Lobby"}
        </button>
      </div>

      {/* WAITING LOBBIES */}
      <h3>🌍 Waiting Lobbies</h3>

      {waiting.length === 0 && (
        <p style={styles.empty}>
          No waiting lobbies yet. Create one to start playing!
        </p>
      )}

      {waiting.map((l) => (
        <div key={l.$id} style={styles.card}>
          <div>
            <p style={styles.stakeText}>
              🪙 {Number(l.stake || 0).toLocaleString()} coins
            </p>

            <p style={styles.status}>
              {l.hostId === user.$id
                ? "Waiting for an opponent..."
                : "Open to join"}
            </p>
          </div>

          {l.hostId !== user.$id && (
            <button
              style={styles.joinButton}
              onClick={() => joinLobby(l)}
              disabled={loadingJoin !== null}
            >
              {loadingJoin === l.$id
                ? "Joining..."
                : "Join"}
            </button>
          )}
        </div>
      ))}

      {/* ACTIVE GAMES */}
      <h3>🎮 Your Active Games</h3>

      {active.length === 0 && (
        <p style={styles.empty}>
          You have no active games.
        </p>
      )}

      {active.map((l) => (
        <div key={l.$id} style={styles.card}>
          <div>
            <p style={styles.stakeText}>
              🪙 {Number(l.stake || 0).toLocaleString()} coins
            </p>

            <p style={styles.status}>
              Match found
            </p>
          </div>

          {l.gameId && (
            <button
              style={styles.joinButton}
              onClick={() => goGame(l.gameId, l.stake)}
            >
              ▶ Resume
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    background: "#0f172a",
    color: "#fff",
    minHeight: "100vh",
    boxSizing: "border-box"
  },

  walletCard: {
    background: "#1e293b",
    border: "1px solid #475569",
    borderRadius: 12,
    padding: 16,
    margin: "16px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },

  createBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 24
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #475569",
    background: "#1e293b",
    color: "#fff",
    outline: "none",
    fontSize: 15
  },

  button: {
    padding: 12,
    borderRadius: 8,
    border: "none",
    background: "#eab308",
    color: "#111827",
    fontWeight: "bold",
    cursor: "pointer"
  },

  card: {
    background: "#1e293b",
    padding: 14,
    margin: "10px 0",
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },

  stakeText: {
    fontWeight: "bold",
    fontSize: 16,
    margin: "0 0 6px"
  },

  status: {
    fontSize: 13,
    color: "#cbd5e1",
    margin: 0
  },

  empty: {
    color: "#94a3b8",
    fontSize: 14
  },

  joinButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    color: "#052e16",
    fontWeight: "bold",
    cursor: "pointer"
  }
};