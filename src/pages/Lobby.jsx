import { useCallback, useEffect, useRef, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  WALLET_COLLECTION,
  ID,
  Query,
} from "../lib/appwrite";

// ======================================================
// CONFIGURATION
// ======================================================

const GAME_COLLECTION = "games";

// Set this in your Vercel environment variables.
// It must be the Appwrite userId belonging to the admin wallet.
const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || "";

const ADMIN_CUT_PERCENT = 20;

const ROOM_CONFIG = {
  beginners: {
    name: "Beginners",
    min: 100,
    max: 350,
    color: "#22c55e",
    description: "Learn and enjoy the game",
  },
  standard: {
    name: "Standard",
    min: 400,
    max: 1000,
    color: "#3b82f6",
    description: "For experienced players",
  },
  premium: {
    name: "Premium",
    min: 1100,
    max: Number.MAX_SAFE_INTEGER,
    color: "#f59e0b",
    description: "High-stake matches",
  },
};

// ======================================================
// HELPERS
// ======================================================

function formatCoins(value) {
  return Math.floor(Number(value) || 0).toLocaleString();
}

function getRoomForStake(stake) {
  const amount = Number(stake);

  if (
    amount >= ROOM_CONFIG.beginners.min &&
    amount <= ROOM_CONFIG.beginners.max
  ) {
    return "beginners";
  }

  if (
    amount >= ROOM_CONFIG.standard.min &&
    amount <= ROOM_CONFIG.standard.max
  ) {
    return "standard";
  }

  if (amount >= ROOM_CONFIG.premium.min) {
    return "premium";
  }

  return null;
}

function getAvailableBalance(wallet) {
  const coins = Number(wallet?.coins || 0);

  if (!Number.isFinite(coins) || coins < 0) {
    return 0;
  }

  return Math.floor(coins);
}

function parsePlayers(players) {
  if (Array.isArray(players)) {
    return players;
  }

  if (typeof players === "string" && players.trim()) {
    try {
      const parsed = JSON.parse(players);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return players
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function getOpponentZangi(match, userId) {
  if (!match || !userId) {
    return "";
  }

  return match.hostId === userId
    ? match.opponentZangiContact || ""
    : match.hostZangiContact || "";
}

function normaliseContact(value) {
  return String(value || "").trim();
}

function isWaitingMatch(match) {
  return (
    match?.status === "waiting" &&
    !match?.opponentId
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #142b50 0%, #081323 48%, #050b14 100%)",
    color: "#f8fafc",
    padding: "20px 14px 40px",
    boxSizing: "border-box",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },

  container: {
    maxWidth: 1000,
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 22,
  },

  brand: {
    fontSize: 25,
    fontWeight: 900,
    letterSpacing: "-0.8px",
    margin: 0,
  },

  brandAccent: {
    color: "#22c55e",
  },

  subtitle: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 5,
  },

  balanceCard: {
    background: "linear-gradient(135deg, #153a34, #102d2a)",
    border: "1px solid #246b54",
    borderRadius: 16,
    padding: "14px 18px",
    minWidth: 150,
  },

  balanceLabel: {
    color: "#a7f3d0",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  balanceAmount: {
    fontSize: 24,
    fontWeight: 900,
    marginTop: 5,
    color: "#4ade80",
  },

  panel: {
    background: "rgba(15, 29, 50, 0.94)",
    border: "1px solid #263b59",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    boxShadow: "0 12px 35px rgba(0,0,0,.18)",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    margin: "0 0 7px",
  },

  sectionText: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 1.6,
    margin: "0 0 16px",
  },

  roomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },

  roomCard: {
    textAlign: "left",
    borderRadius: 14,
    padding: 16,
    cursor: "pointer",
    color: "#f8fafc",
    background: "#0b1729",
    border: "1px solid #263b59",
    minHeight: 110,
  },

  roomName: {
    fontWeight: 900,
    fontSize: 16,
    marginBottom: 7,
  },

  roomDescription: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 1.5,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },

  fieldLabel: {
    display: "block",
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 12px",
    borderRadius: 10,
    border: "1px solid #334a68",
    background: "#081323",
    color: "#f8fafc",
    outline: "none",
    fontSize: 15,
  },

  button: {
    border: 0,
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    transition: "opacity .2s",
  },

  primaryButton: {
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "#04130a",
  },

  secondaryButton: {
    background: "#1e3351",
    color: "#e2e8f0",
    border: "1px solid #354d6c",
  },

  dangerButton: {
    background: "#451b26",
    color: "#fecaca",
    border: "1px solid #7f293a",
  },

  buttonRow: {
    display: "flex",
    gap: 9,
    flexWrap: "wrap",
    marginTop: 14,
  },

  error: {
    padding: 12,
    background: "#451b26",
    border: "1px solid #7f293a",
    color: "#fecaca",
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  },

  success: {
    padding: 12,
    background: "#123a2b",
    border: "1px solid #23724c",
    color: "#bbf7d0",
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  },

  matchList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  },

  matchCard: {
    background: "#0a1728",
    border: "1px solid #293e5c",
    borderRadius: 14,
    padding: 15,
  },

  matchTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  badge: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 900,
    padding: "5px 8px",
    borderRadius: 20,
    background: "#183c2c",
    color: "#86efac",
    textTransform: "uppercase",
  },

  matchAmount: {
    fontSize: 21,
    fontWeight: 900,
    color: "#4ade80",
    margin: "6px 0",
  },

  muted: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 1.6,
  },

  divider: {
    height: 1,
    background: "#263b59",
    border: 0,
    margin: "18px 0",
  },

  empty: {
    padding: "24px 12px",
    textAlign: "center",
    borderRadius: 12,
    border: "1px dashed #334a68",
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 1.7,
  },

  popupOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    zIndex: 9999,
  },

  popup: {
    width: "100%",
    maxWidth: 430,
    background: "#102039",
    border: "1px solid #344a69",
    borderRadius: 18,
    padding: 22,
    boxSizing: "border-box",
    boxShadow: "0 25px 80px rgba(0,0,0,.5)",
  },

  popupTitle: {
    fontSize: 21,
    fontWeight: 900,
    margin: "0 0 10px",
  },

  popupText: {
    color: "#aabbd0",
    fontSize: 13,
    lineHeight: 1.7,
    margin: "0 0 16px",
  },
};

// ======================================================
// COMPONENT
// ======================================================

export default function Lobby({ goGame, back }) {
  const mountedRef = useRef(true);
  const actionLockRef = useRef(false);

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});

  const [stake, setStake] = useState("100");
  const [selectedRoom, setSelectedRoom] = useState("beginners");

  const [loading, setLoading] = useState(true);
  const [loadingJoin, setLoadingJoin] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingZangi, setSavingZangi] = useState(false);

  const [zangiInput, setZangiInput] = useState("");
  const [showZangiPopup, setShowZangiPopup] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const availableCoins = getAvailableBalance(wallet);

  // ----------------------------------------------------
  // WALLET
  // ----------------------------------------------------

  const getFreshWallet = useCallback(async (userId) => {
    if (!userId) {
      throw new Error("You must sign in first.");
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", userId),
        Query.limit(1),
      ]
    );

    if (!response.documents.length) {
      throw new Error(
        "Your wallet was not found. Please contact support."
      );
    }

    return response.documents[0];
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!user?.$id) return;

    const freshWallet = await getFreshWallet(user.$id);

    if (mountedRef.current) {
      setWallet(freshWallet);
    }

    return freshWallet;
  }, [user, getFreshWallet]);

  // ----------------------------------------------------
  // ADMIN WALLET
  // ----------------------------------------------------

  const getAdminWallet = useCallback(async () => {
    if (!ADMIN_USER_ID) {
      throw new Error(
        "Admin wallet configuration is missing. Set VITE_ADMIN_USER_ID in your environment variables."
      );
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", ADMIN_USER_ID),
        Query.limit(1),
      ]
    );

    if (!response.documents.length) {
      throw new Error(
        "The configured admin wallet could not be found."
      );
    }

    return response.documents[0];
  }, []);

  // ----------------------------------------------------
  // MATCH REFRESH
  // ----------------------------------------------------

  const loadMatches = useCallback(async () => {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("status", "waiting"),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]
    );

    const available = response.documents.filter(
      (match) =>
        isWaitingMatch(match) &&
        match.hostId !== user?.$id
    );

    if (mountedRef.current) {
      setMatches(available);
    }
  }, [user]);

  const loadActiveMatches = useCallback(async () => {
    if (!user?.$id) return;

    const response = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]
    );

    const relevantMatches = response.documents.filter(
      (match) =>
        match.hostId === user.$id ||
        match.opponentId === user.$id
    );

    const nextGameMap = {};
    const active = [];

    for (const match of relevantMatches) {
      let game = null;

      if (match.gameId) {
        try {
          game = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            match.gameId
          );
        } catch {
          game = null;
        }
      }

      if (game) {
        nextGameMap[game.$id] = game;
      }

      const gameStatus = game?.status;

      if (
        match.status === "playing" ||
        match.status === "matched" ||
        gameStatus === "playing"
      ) {
        active.push({
          ...match,
          game,
        });
      }
    }

    if (mountedRef.current) {
      setGameMap(nextGameMap);
      setActiveMatches(active);
    }
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user?.$id) return;

    try {
      await Promise.all([
        refreshWallet(),
        loadMatches(),
        loadActiveMatches(),
      ]);
    } catch (error) {
      if (mountedRef.current) {
        setErrorMessage(
          error?.message || "Unable to refresh the lobby."
        );
      }
    }
  }, [
    user,
    refreshWallet,
    loadMatches,
    loadActiveMatches,
  ]);

  // ----------------------------------------------------
  // INITIALISATION
  // ----------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      try {
        const currentUser = await account.get();

        if (!mountedRef.current) return;

        setUser(currentUser);

        const response = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal("userId", currentUser.$id),
            Query.limit(1),
          ]
        );

        if (!response.documents.length) {
          throw new Error(
            "Your wallet was not found. Please contact support."
          );
        }

        const currentWallet = response.documents[0];

        if (!mountedRef.current) return;

        setWallet(currentWallet);
        setZangiInput(currentWallet.zangiContact || "");

        if (!currentWallet.zangiContact) {
          setShowZangiPopup(true);
        }
      } catch (error) {
        if (mountedRef.current) {
          setErrorMessage(
            error?.message || "Unable to load your account."
          );
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (user?.$id) {
      refresh();
    }
  }, [user?.$id, refresh]);

  // ----------------------------------------------------
  // SAVE ZANGI CONTACT
  // ----------------------------------------------------

  async function saveZangi() {
    setErrorMessage("");
    setSuccessMessage("");

    const contact = normaliseContact(zangiInput);

    if (!contact) {
      setErrorMessage("Enter your Zangi contact first.");
      return;
    }

    if (!user?.$id || !wallet?.$id) {
      setErrorMessage("Your wallet is not ready.");
      return;
    }

    setSavingZangi(true);

    try {
      const updated = await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        {
          zangiContact: contact,
        }
      );

      if (!mountedRef.current) return;

      setWallet(updated);
      setZangiInput(contact);
      setShowZangiPopup(false);

      setSuccessMessage("Your Zangi contact has been saved.");
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to save your Zangi contact."
      );
    } finally {
      if (mountedRef.current) {
        setSavingZangi(false);
      }
    }
  }

  // ----------------------------------------------------
  // SELECT ROOM
  // ----------------------------------------------------

  function chooseRoom(roomKey) {
    const room = ROOM_CONFIG[roomKey];

    if (!room) return;

    setSelectedRoom(roomKey);
    setStake(String(room.min));
    setErrorMessage("");
    setSuccessMessage("");
  }

  function validateStake() {
    const amount = Number(stake);

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Enter a valid whole-number coin stake."
      );
    }

    const roomKey = getRoomForStake(amount);

    if (!roomKey) {
      throw new Error(
        "Your stake does not match an available room."
      );
    }

    return {
      amount,
      roomKey,
    };
  }

  // ----------------------------------------------------
  // CREATE MATCH
  // ----------------------------------------------------

  async function createMatch() {
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setCreating(true);
    setErrorMessage("");
    setSuccessMessage("");

    let stakeDeducted = false;
    let deductedAmount = 0;

    try {
      if (!user?.$id) {
        throw new Error("Please sign in first.");
      }

      if (!wallet?.zangiContact) {
        setShowZangiPopup(true);
        throw new Error(
          "Save your Zangi contact before creating a match."
        );
      }

      const { amount, roomKey } = validateStake();

      const freshWallet = await getFreshWallet(user.$id);
      const freshCoins = getAvailableBalance(freshWallet);

      if (freshCoins < amount) {
        throw new Error(
          "Insufficient coins. Please purchase more coins."
        );
      }

      // Deduct the host's stake.
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          coins: freshCoins - amount,
        }
      );

      stakeDeducted = true;
      deductedAmount = amount;

      const match = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          opponentId: null,
          stake: amount,
          pot: amount,
          status: "waiting",
          refundDone: false,
          payoutDone: false,
          hostZangiContact: wallet.zangiContact || "",
          room: roomKey,
          adminCut: 0,
        }
      );

      setStake(String(amount));
      setSelectedRoom(roomKey);

      setSuccessMessage(
        `Match created. ${formatCoins(amount)} coins have been reserved from your wallet.`
      );

      await refresh();

      return match;
    } catch (error) {
      // Best-effort refund if match creation failed after deduction.
      // This is not an atomic or production-safe financial transaction.
      if (stakeDeducted && deductedAmount > 0 && user?.$id) {
        try {
          const latestWallet = await getFreshWallet(user.$id);

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            latestWallet.$id,
            {
              coins:
                Number(latestWallet.coins || 0) +
                deductedAmount,
            }
          );
        } catch (refundError) {
          console.error(
            "Automatic stake refund failed:",
            refundError
          );
        }
      }

      setErrorMessage(
        error?.message || "Unable to create the match."
      );
    } finally {
      actionLockRef.current = false;
      setCreating(false);
    }
  }

  // ----------------------------------------------------
  // JOIN MATCH
  // ----------------------------------------------------

  async function joinMatch(match) {
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setLoadingJoin(match.$id);
    setErrorMessage("");
    setSuccessMessage("");

    let opponentStakeDeducted = false;
    let deductedAmount = 0;

    try {
      if (!user?.$id) {
        throw new Error("Please sign in first.");
      }

      if (match.hostId === user.$id) {
        throw new Error("You cannot join your own match.");
      }

      if (!wallet?.zangiContact) {
        setShowZangiPopup(true);
        throw new Error(
          "Save your Zangi contact before joining a match."
        );
      }

      // Read the match again to avoid relying only on stale UI state.
      const freshMatch = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (!isWaitingMatch(freshMatch)) {
        throw new Error(
          "This match is no longer available."
        );
      }

      const amount = Number(freshMatch.stake);

      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
      ) {
        throw new Error("This match has an invalid stake.");
      }

      const freshWallet = await getFreshWallet(user.$id);
      const freshCoins = getAvailableBalance(freshWallet);

      if (freshCoins < amount) {
        throw new Error(
          "Insufficient coins to join this match."
        );
      }

      // Deduct the opponent's stake.
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          coins: freshCoins - amount,
        }
      );

      opponentStakeDeducted = true;
      deductedAmount = amount;

      // The match must be updated successfully before a game is created.
      const totalCollected = amount * 2;
      const adminCut = Math.floor(
        (totalCollected * ADMIN_CUT_PERCENT) / 100
      );
      const prizePot = totalCollected - adminCut;

      const claimedMatch = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        freshMatch.$id,
        {
          opponentId: user.$id,
          status: "matched",
          opponentZangiContact: wallet.zangiContact || "",
          adminCut,
          pot: prizePot,
        }
      );

      // Credit the admin wallet's `coins` field.
      // Direct browser-side financial updates are not secure.
      const adminWallet = await getAdminWallet();
      const adminCoins = getAvailableBalance(adminWallet);

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        adminWallet.$id,
        {
          coins: adminCoins + adminCut,
        }
      );

      // Create the game document.
      const players = [
        freshMatch.hostId,
        user.$id,
      ];

      const game = await databases.createDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        ID.unique(),
        {
          matchId: freshMatch.$id,
          players: players.join(","),
          status: "playing",
          turn: freshMatch.hostId,
          payoutDone: false,
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        claimedMatch.$id,
        {
          gameId: game.$id,
          status: "playing",
        }
      );

      setSuccessMessage(
        `You joined successfully. Admin commission: ${formatCoins(adminCut)} coins. Winner's prize: ${formatCoins(prizePot)} coins.`
      );

      await refresh();
    } catch (error) {
      // Best-effort refund of the joining player's stake.
      // This cannot safely undo every partial operation above.
      if (
        opponentStakeDeducted &&
        deductedAmount > 0 &&
        user?.$id
      ) {
        try {
          const latestWallet = await getFreshWallet(user.$id);

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            latestWallet.$id,
            {
              coins:
                Number(latestWallet.coins || 0) +
                deductedAmount,
            }
          );
        } catch (refundError) {
          console.error(
            "Automatic joining-stake refund failed:",
            refundError
          );
        }
      }

      setErrorMessage(
        error?.message || "Unable to join this match."
      );
    } finally {
      actionLockRef.current = false;
      setLoadingJoin("");
    }
  }
  // ----------------------------------------------------
  // CANCEL WAITING MATCH AND REFUND
  // ----------------------------------------------------

  async function cancelMatch(match) {
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (!user?.$id) {
        throw new Error("Please sign in first.");
      }

      const freshMatch = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (freshMatch.hostId !== user.$id) {
        throw new Error(
          "Only the match creator can cancel this match."
        );
      }

      if (!isWaitingMatch(freshMatch)) {
        throw new Error(
          "This match cannot be cancelled because another player may have joined."
        );
      }

      if (freshMatch.refundDone) {
        throw new Error("This match has already been refunded.");
      }

      const amount = Number(freshMatch.stake);

      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
      ) {
        throw new Error("The match stake is invalid.");
      }

      const freshWallet = await getFreshWallet(user.$id);

      // Mark the match cancelled before issuing the refund.
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        freshMatch.$id,
        {
          status: "cancelled",
          refundDone: true,
        }
      );

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          coins:
            Number(freshWallet.coins || 0) + amount,
        }
      );

      setSuccessMessage(
        `Match cancelled. ${formatCoins(amount)} coins refunded.`
      );

      await refresh();
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to cancel this match."
      );
    } finally {
      actionLockRef.current = false;
    }
  }

  // ----------------------------------------------------
  // OPEN OPPONENT'S ZANGI CONTACT
  // ----------------------------------------------------

  async function openZangi(match) {
    try {
      const contact = getOpponentZangi(
        match,
        user?.$id
      );

      if (!contact) {
        setErrorMessage(
          "The other player has not provided a Zangi contact."
        );
        return;
      }

      const cleanedContact = contact.replace(/\s+/g, "");

      const isPhoneNumber = /^\+?[0-9]+$/.test(
        cleanedContact
      );

      if (isPhoneNumber) {
        const digits = cleanedContact.replace(/\D/g, "");

        window.location.href =
          `zangi://chat?number=${encodeURIComponent(digits)}`;

        return;
      }

      const zangiUrl = `https://zangi.com/`;

      window.open(
        zangiUrl,
        "_blank",
        "noopener,noreferrer"
      );

      setSuccessMessage(
        `Opponent's Zangi contact: ${contact}. Open Zangi and contact the player.`
      );
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to open Zangi."
      );
    }
  }

  // ----------------------------------------------------
  // RESUME GAME
  // ----------------------------------------------------

  function resumeGame(match) {
    const gameId =
      match.gameId ||
      match.game?.$id ||
      "";

    if (!gameId) {
      setErrorMessage(
        "The game has not finished loading. Refresh and try again."
      );
      return;
    }

    if (typeof goGame === "function") {
      goGame(gameId, match.stake);
    } else {
      setErrorMessage(
        "Game navigation is not configured."
      );
    }
  }

  // ----------------------------------------------------
  // LOADING STATE
  // ----------------------------------------------------

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.panel}>
            <h2 style={styles.sectionTitle}>
              Loading Win9ja Life...
            </h2>

            <p style={styles.sectionText}>
              Preparing your wallet and game lobby.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MAIN LOBBY
  // ----------------------------------------------------

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}

        <header style={styles.header}>
          <div>
            <h1 style={styles.brand}>
              Win9ja{" "}
              <span style={styles.brandAccent}>
                Life
              </span>
            </h1>

            <div style={styles.subtitle}>
              Play. Compete. Win.
            </div>
          </div>

          <div style={styles.balanceCard}>
            <div style={styles.balanceLabel}>
              Available Coins
            </div>

            <div style={styles.balanceAmount}>
              🪙 {formatCoins(availableCoins)}
            </div>
          </div>
        </header>

        {/* MESSAGES */}

        {errorMessage && (
          <div style={styles.error}>
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div style={styles.success}>
            {successMessage}
          </div>
        )}

        {/* NAVIGATION */}

        {typeof back === "function" && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              style={{
                ...styles.button,
                ...styles.secondaryButton,
              }}
              onClick={back}
            >
              ← Back
            </button>
          </div>
        )}

        {/* ROOMS */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Choose Your Room
          </h2>

          <p style={styles.sectionText}>
            Select a room according to your coin stake.
          </p>

          <div style={styles.roomGrid}>
            {Object.entries(ROOM_CONFIG).map(
              ([key, room]) => {
                const selected = selectedRoom === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => chooseRoom(key)}
                    style={{
                      ...styles.roomCard,
                      borderColor: selected
                        ? room.color
                        : "#263b59",
                      boxShadow: selected
                        ? `inset 0 0 0 1px ${room.color}`
                        : "none",
                    }}
                  >
                    <div
                      style={{
                        ...styles.roomName,
                        color: room.color,
                      }}
                    >
                      {room.name}
                      {selected ? " ✓" : ""}
                    </div>

                    <div style={styles.roomDescription}>
                      {room.description}
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {key === "premium"
                        ? "1,100+ coins"
                        : `${formatCoins(room.min)}–${formatCoins(room.max)} coins`}
                    </div>
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* CREATE MATCH */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Create a Match
          </h2>

          <p style={styles.sectionText}>
            Choose your stake and wait for another player
            to join. Your stake is deducted when you
            create the match.
          </p>

          <div style={styles.formGrid}>
            <div>
              <label
                htmlFor="lobby-stake"
                style={styles.fieldLabel}
              >
                Stake Amount (Coins)
              </label>

              <input
                id="lobby-stake"
                type="number"
                min="100"
                step="1"
                value={stake}
                onChange={(event) => {
                  const value = event.target.value;

                  setStake(value);

                  const room = getRoomForStake(
                    Number(value)
                  );

                  if (room) {
                    setSelectedRoom(room);
                  }
                }}
                style={styles.input}
                placeholder="Enter coin stake"
              />
            </div>

            <div>
              <label
                htmlFor="lobby-zangi"
                style={styles.fieldLabel}
              >
                Your Zangi Contact
              </label>

              <input
                id="lobby-zangi"
                type="text"
                value={zangiInput}
                onChange={(event) =>
                  setZangiInput(event.target.value)
                }
                style={styles.input}
                placeholder="Phone number or contact"
              />
            </div>
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              disabled={creating}
              onClick={createMatch}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                opacity: creating ? 0.6 : 1,
              }}
            >
              {creating
                ? "Creating Match..."
                : `Create Match · ${formatCoins(Number(stake) || 0)} Coins`}
            </button>

            <button
              type="button"
              disabled={savingZangi}
              onClick={saveZangi}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
                opacity: savingZangi ? 0.6 : 1,
              }}
            >
              {savingZangi
                ? "Saving..."
                : "Save Zangi Contact"}
            </button>

            <button
              type="button"
              onClick={refresh}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </section>

        {/* AVAILABLE MATCHES */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Available Matches
          </h2>

          <p style={styles.sectionText}>
            Join another player's waiting match using
            the same stake amount.
          </p>

          {matches.length === 0 ? (
            <div style={styles.empty}>
              No waiting matches at the moment.
              <br />
              Create a match and wait for another
              player to join.
            </div>
          ) : (
            <div style={styles.matchList}>
              {matches.map((match) => (
                <article
                  key={match.$id}
                  style={styles.matchCard}
                >
                  <div style={styles.matchTop}>
                    <span style={styles.badge}>
                      Waiting
                    </span>

                    <span style={styles.muted}>
                      {ROOM_CONFIG[
                        match.room ||
                        getRoomForStake(match.stake)
                      ]?.name || "Game Room"}
                    </span>
                  </div>

                  <div style={styles.muted}>
                    Host
                  </div>

                  <div
                    style={{
                      fontWeight: 800,
                      marginBottom: 12,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {match.hostId}
                  </div>

                  <div style={styles.muted}>
                    Required Stake
                  </div>

                  <div style={styles.matchAmount}>
                    🪙 {formatCoins(match.stake)}
                  </div>

                  <div style={styles.muted}>
                    Both players stake the same number
                    of coins.
                  </div>

                  <div style={styles.buttonRow}>
                    <button
                      type="button"
                      disabled={
                        loadingJoin === match.$id
                      }
                      onClick={() => joinMatch(match)}
                      style={{
                        ...styles.button,
                        ...styles.primaryButton,
                        width: "100%",
                        opacity:
                          loadingJoin === match.$id
                            ? 0.6
                            : 1,
                      }}
                    >
                      {loadingJoin === match.$id
                        ? "Joining..."
                        : `Join · ${formatCoins(match.stake)} Coins`}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* YOUR ACTIVE MATCHES */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Your Active Matches
          </h2>

          <p style={styles.sectionText}>
            Continue matches that you have created or
            joined.
          </p>

          {activeMatches.length === 0 ? (
            <div style={styles.empty}>
              You have no active matches.
            </div>
          ) : (
            <div style={styles.matchList}>
              {activeMatches.map((match) => {
                const isHost =
                  match.hostId === user?.$id;

                const opponentId = isHost
                  ? match.opponentId
                  : match.hostId;

                const game = match.game ||
                  gameMap[match.gameId];

                const opponentContact =
                  getOpponentZangi(match, user?.$id);

                return (
                  <article
                    key={match.$id}
                    style={styles.matchCard}
                  >
                    <div style={styles.matchTop}>
                      <span style={styles.badge}>
                        {match.status === "playing"
                          ? "Playing"
                          : "Matched"}
                      </span>

                      <span style={styles.muted}>
                        {isHost ? "Host" : "Opponent"}
                      </span>
                    </div>

                    <div style={styles.muted}>
                      Opponent
                    </div>

                    <div
                      style={{
                        fontWeight: 800,
                        overflowWrap: "anywhere",
                        margin: "5px 0 12px",
                      }}
                    >
                      {opponentId || "Waiting for player"}
                    </div>

                    <div style={styles.muted}>
                      Your Stake
                    </div>

                    <div style={styles.matchAmount}>
                      🪙 {formatCoins(match.stake)}
                    </div>

                    <div style={styles.muted}>
                      Winner's potential prize:{" "}
                      {formatCoins(match.pot)}
                      {" coins"}
                    </div>

                    {opponentContact && (
                      <div
                        style={{
                          marginTop: 12,
                          fontSize: 12,
                          color: "#a7f3d0",
                          overflowWrap: "anywhere",
                        }}
                      >
                        Opponent contact:{" "}
                        {opponentContact}
                      </div>
                    )}

                    <div style={styles.buttonRow}>
                      {match.gameId && (
                        <button
                          type="button"
                          onClick={() =>
                            resumeGame(match)
                          }
                          style={{
                            ...styles.button,
                            ...styles.primaryButton,
                          }}
                        >
                          Resume Game
                        </button>
                      )}

                      {opponentId && (
                        <button
                          type="button"
                          onClick={() =>
                            openZangi(match)
                          }
                          style={{
                            ...styles.button,
                            ...styles.secondaryButton,
                          }}
                        >
                          Contact Player
                        </button>
                      )}

                      {isHost &&
                        isWaitingMatch(match) && (
                          <button
                            type="button"
                            onClick={() =>
                              cancelMatch(match)
                            }
                            style={{
                              ...styles.button,
                              ...styles.dangerButton,
                            }}
                          >
                            Cancel & Refund
                          </button>
                        )}
                    </div>

                    {game?.status === "finished" && (
                      <div
                        style={{
                          marginTop: 12,
                          color: "#fcd34d",
                          fontSize: 12,
                        }}
                      >
                        The game is finished. Confirm
                        the verified result before
                        processing a winner payout.
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* COMMISSION INFORMATION */}

        <section
          style={{
            ...styles.panel,
            background: "rgba(10, 23, 40, .8)",
          }}
        >
          <h2 style={styles.sectionTitle}>
            Match Prize Information
          </h2>

          <p style={styles.sectionText}>
            The current rule calculates a 20% admin
            commission from the combined stakes, with
            the remaining 80% reserved for the winner.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={styles.muted}>
                Admin Commission
              </div>

              <div
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  color: "#fbbf24",
                  marginTop: 6,
                }}
              >
                20%
              </div>
            </div>

            <div>
              <div style={styles.muted}>
                Winner's Prize
              </div>

              <div
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  color: "#4ade80",
                  marginTop: 6,
                }}
              >
                80%
              </div>
            </div>
          </div>

          <hr style={styles.divider} />

          <div style={styles.muted}>
            Example: two players stake 500 coins each.
            The combined stakes are 1,000 coins, the
            admin commission is 200 coins, and the
            winner's prize is 800 coins.
          </div>
        </section>

      </div>

      {/* ZANGI SETUP POPUP */}

      {showZangiPopup && (
        <div style={styles.popupOverlay}>
          <div style={styles.popup}>
            <h2 style={styles.popupTitle}>
              Set Up Your Zangi Contact
            </h2>

            <p style={styles.popupText}>
              Add your Zangi phone number or contact
              so other players can contact you after
              matching.
            </p>

            <label
              htmlFor="zangi-popup-input"
              style={styles.fieldLabel}
            >
              Zangi Contact
            </label>

            <input
              id="zangi-popup-input"
              type="text"
              value={zangiInput}
              onChange={(event) =>
                setZangiInput(event.target.value)
              }
              style={styles.input}
              placeholder="Enter Zangi contact"
            />

            <div style={styles.buttonRow}>
              <button
                type="button"
                disabled={savingZangi}
                onClick={saveZangi}
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  flex: 1,
                  opacity: savingZangi ? 0.6 : 1,
                }}
              >
                {savingZangi
                  ? "Saving..."
                  : "Save Contact"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowZangiPopup(false)
                }
                style={{
                  ...styles.button,
                  ...styles.secondaryButton,
                }}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}