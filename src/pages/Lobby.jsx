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
const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || "";
const ADMIN_CUT_PERCENT = 20;
const REFRESH_INTERVAL = 8000;

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

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }

  if (amount >= 100 && amount <= 350) {
    return "beginners";
  }

  if (amount >= 400 && amount <= 1000) {
    return "standard";
  }

  if (amount >= 1100) {
    return "premium";
  }

  return null;
}

function getAvailableBalance(wallet) {
  const coins = Number(wallet?.coins ?? 0);

  if (!Number.isFinite(coins) || coins < 0) {
    return 0;
  }

  return Math.floor(coins);
}

function normaliseContact(value) {
  return String(value || "").trim();
}

function isWaitingMatch(match) {
  return match?.status === "waiting" && !match?.opponentId;
}

function getOpponentZangi(match, userId) {
  if (!match || !userId) return "";

  if (match.hostId === userId) {
    return normaliseContact(match.opponentZangiContact);
  }

  if (match.opponentId === userId) {
    return normaliseContact(match.hostZangiContact);
  }

  return "";
}

function buildZangiConversationUrl(contact) {
  const value = normaliseContact(contact);

  if (!value) return "";

  if (
    /^https:\/\/services\.zangi\.com\/dl\/conversation\/[^/?#]+/i.test(
      value
    )
  ) {
    return value;
  }

  return (
    "https://services.zangi.com/dl/conversation/" +
    encodeURIComponent(value)
  );
}

function getTurnInfo(game, currentUserId) {
  if (!game || !currentUserId) {
    return {
      status: "unknown",
      label: "Turn information unavailable",
    };
  }

  const turn = game.turn;

  if (turn === null || turn === undefined || turn === "") {
    return {
      status: "unknown",
      label: "Waiting for turn information",
    };
  }

  if (String(turn) === String(currentUserId)) {
    return {
      status: "mine",
      label: "Your turn",
    };
  }

  let players = game.players;

  if (typeof players === "string") {
    players = players.split(",").map((id) => id.trim());
  }

  if (Array.isArray(players)) {
    const index = Number(turn);

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < players.length
    ) {
      return String(players[index]) === String(currentUserId)
        ? { status: "mine", label: "Your turn" }
        : { status: "opponent", label: "Opponent's turn" };
    }
  }

  return {
    status: "opponent",
    label: "Opponent's turn",
  };
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
  notification: {
    position: "fixed",
    right: 16,
    bottom: 18,
    width: "min(380px, calc(100vw - 32px))",
    boxSizing: "border-box",
    padding: 16,
    borderRadius: 14,
    background: "#153a34",
    border: "1px solid #22c55e",
    boxShadow: "0 15px 45px rgba(0,0,0,.4)",
    zIndex: 10000,
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
  const mountedRef = useRef(false);
  const actionLockRef = useRef(false);
  const audioRef = useRef(null);
  const notificationTimerRef = useRef(null);
  const knownMatchStatesRef = useRef(new Map());
  const openedGameIdsRef = useRef(new Set());
  const openingGameIdsRef = useRef(new Set());
  const refreshLockRef = useRef(false);

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
  const [repairingMatch, setRepairingMatch] = useState("");

  const [zangiInput, setZangiInput] = useState("");
  const [showZangiPopup, setShowZangiPopup] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [notification, setNotification] = useState(null);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const availableCoins = getAvailableBalance(wallet);

  // ----------------------------------------------------
  // SOUND
  // ----------------------------------------------------

  const stopNotificationTimer = useCallback(() => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
  }, []);

  const playAlertSound = useCallback((type = "info") => {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      if (!audioRef.current) {
        audioRef.current = new AudioContextClass();
      }

      const ctx = audioRef.current;

      const frequencies = {
        success: [660, 880],
        error: [240, 180],
        opponent: [520, 780, 1040],
        info: [500, 650],
      };

      const tones = frequencies[type] || frequencies.info;

      const playTone = () => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        const start = ctx.currentTime;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(tones[0], start);

        tones.forEach((frequency, index) => {
          oscillator.frequency.setValueAtTime(
            frequency,
            start + index * 0.13
          );
        });

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          start + tones.length * 0.13 + 0.12
        );

        oscillator.start(start);
        oscillator.stop(start + tones.length * 0.13 + 0.15);
      };

      if (ctx.state === "suspended") {
        ctx.resume().then(playTone).catch(() => {});
      } else {
        playTone();
      }
    } catch (error) {
      console.warn("Notification sound unavailable:", error);
    }
  }, []);

  const speakMessage = useCallback((message) => {
    try {
      if (!("speechSynthesis" in window)) return;

      window.speechSynthesis.cancel();

      const speech = new SpeechSynthesisUtterance(
        String(message || "").slice(0, 250)
      );

      speech.lang = "en-NG";
      speech.rate = 1;
      speech.pitch = 1;

      window.speechSynthesis.speak(speech);
    } catch (error) {
      console.warn("Voice notification unavailable:", error);
    }
  }, []);

  const notify = useCallback(
    (message, type = "info", options = {}) => {
      const { speak = true, sound = true } = options;

      if (!mountedRef.current) return;

      setNotification({
        message,
        type,
        id: Date.now(),
      });

      stopNotificationTimer();

      notificationTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setNotification(null);
      }, 8000);

      if (sound && soundEnabled) {
        playAlertSound(type);
      }

      if (speak && voiceEnabled) {
        speakMessage(message);
      }
    },
    [
      playAlertSound,
      speakMessage,
      stopNotificationTimer,
      soundEnabled,
      voiceEnabled,
    ]
  );

  const reportError = useCallback(
    (message) => {
      setErrorMessage(message);
      setSuccessMessage("");
      notify(message, "error");
    },
    [notify]
  );

  const reportSuccess = useCallback(
    (message) => {
      setSuccessMessage(message);
      setErrorMessage("");
      notify(message, "success");
    },
    [notify]
  );

  // ----------------------------------------------------
  // ENABLE SOUND AND VOICE
  // ----------------------------------------------------

  async function enableVoiceAndSound() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass) {
        if (!audioRef.current) {
          audioRef.current = new AudioContextClass();
        }

        if (audioRef.current.state === "suspended") {
          await audioRef.current.resume();
        }
      }

      setSoundEnabled(true);

      if ("speechSynthesis" in window) {
        setVoiceEnabled(true);
        speakMessage("Win9ja Life voice notifications are enabled.");
      }

      playAlertSound("success");

      setSuccessMessage("Voice and sound notifications are enabled.");
      setErrorMessage("");
    } catch {
      reportError(
        "Your device could not enable sound. Check your device volume and browser settings."
      );
    }
  }

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
      [Query.equal("userId", userId), Query.limit(1)]
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
        "Admin wallet configuration is missing. Set VITE_ADMIN_USER_ID."
      );
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", ADMIN_USER_ID), Query.limit(1)]
    );

    if (!response.documents.length) {
      throw new Error(
        "The configured admin wallet could not be found."
      );
    }

    return response.documents[0];
  }, []);

  // ----------------------------------------------------
  // FIND OR CREATE GAME FOR A CLAIMED MATCH
  // ----------------------------------------------------

  const ensureGameForMatch = useCallback(async (matchDoc) => {
    if (
      !matchDoc?.$id ||
      !matchDoc.hostId ||
      !matchDoc.opponentId
    ) {
      throw new Error(
        "Both players must be assigned before the game can start."
      );
    }

    let game = null;

    // First try the game's ID stored on the match.
    if (matchDoc.gameId) {
      try {
        game = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          matchDoc.gameId
        );
      } catch {
        // Continue to search games by matchId.
      }
    }

    // A game may already exist even if the match was never linked.
    if (!game) {
      const found = await databases.listDocuments(
        DATABASE_ID,
        GAME_COLLECTION,
        [
          Query.equal("matchId", matchDoc.$id),
          Query.limit(1),
        ]
      );

      game = found.documents[0] || null;
    }

    // Create a game only if no existing game can be found.
    if (!game) {
      game = await databases.createDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        ID.unique(),
        {
          matchId: matchDoc.$id,
          players: `${matchDoc.hostId},${matchDoc.opponentId}`,
          status: "playing",
          turn: matchDoc.hostId,
          payoutDone: false,
        }
      );
    }

    // Repair the match link even when an existing game was found.
    // This avoids returning early with a broken match.gameId.
    if (
      matchDoc.gameId !== game.$id ||
      matchDoc.status !== "playing"
    ) {
      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        matchDoc.$id,
        {
          gameId: game.$id,
          status: "playing",
        }
      );
    }

    return game;
  }, []);

  // ----------------------------------------------------
  // OPEN GAME SAFELY
  // ----------------------------------------------------

  const openGameOnce = useCallback(
    (gameId, gameStake, automatic = false) => {
      if (!gameId || typeof goGame !== "function") {
        if (!automatic) {
          reportError(
            "Game navigation is not configured. Check the parent component that supplies goGame."
          );
        }

        return false;
      }

      if (
        openedGameIdsRef.current.has(gameId) ||
        openingGameIdsRef.current.has(gameId)
      ) {
        return false;
      }

      openingGameIdsRef.current.add(gameId);

      try {
        goGame(gameId, gameStake);
        openedGameIdsRef.current.add(gameId);
        return true;
      } catch (error) {
        openingGameIdsRef.current.delete(gameId);

        console.error("Unable to open Whot game:", error);

        if (!automatic) {
          reportError(
            "The Whot game could not be opened. Try again."
          );
        }

        return false;
      }
    },
    [goGame, reportError]
  );

  // ----------------------------------------------------
  // WAITING MATCHES
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

  // ----------------------------------------------------
  // ACTIVE MATCHES AND HOST NOTIFICATIONS
  // ----------------------------------------------------

  const loadActiveMatches = useCallback(async () => {
    if (!user?.$id) return;

    const response = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.orderDesc("$createdAt"), Query.limit(100)]
    );

    const relevantMatches = response.documents.filter(
      (match) =>
        match.hostId === user.$id ||
        match.opponentId === user.$id
    );

    const nextGameMap = {};
    const active = [];

    for (const match of relevantMatches) {
      const previous = knownMatchStatesRef.current.get(match.$id);

      const newOpponentJoined =
        previous &&
        previous.opponentId !== (match.opponentId || "") &&
        Boolean(match.opponentId);

      if (newOpponentJoined && match.hostId === user.$id) {
        notify(
          "A player has joined your match. Your game is being prepared.",
          "opponent"
        );
      }

      knownMatchStatesRef.current.set(match.$id, {
        opponentId: match.opponentId || "",
        status: match.status || "",
        gameId: match.gameId || "",
      });

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

      if (
        match.status === "playing" ||
        match.status === "matched" ||
        game?.status === "playing"
      ) {
        active.push({ ...match, game });
      }

      // Automatically open the host's game once when it becomes ready.
      if (
        match.status === "playing" &&
        match.gameId &&
        game &&
        match.hostId === user.$id &&
        !openedGameIdsRef.current.has(game.$id)
      ) {
        if (
          newOpponentJoined ||
          previous?.gameId !== match.gameId
        ) {
          notify(
            "Your opponent has joined. Opening the Whot game.",
            "opponent"
          );

          openGameOnce(game.$id, match.stake, true);
        }
      }
    }

    if (mountedRef.current) {
      setGameMap(nextGameMap);
      setActiveMatches(active);
    }
  }, [user, notify, openGameOnce]);

  // ----------------------------------------------------
  // REFRESH
  // ----------------------------------------------------

  const refresh = useCallback(async () => {
    if (!user?.$id || refreshLockRef.current) return;

    refreshLockRef.current = true;

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
    } finally {
      refreshLockRef.current = false;
    }
  }, [user, refreshWallet, loadMatches, loadActiveMatches]);

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

        const currentWallet = await getFreshWallet(currentUser.$id);

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
      stopNotificationTimer();

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      if (audioRef.current) {
        audioRef.current.close().catch(() => {});
        audioRef.current = null;
      }
    };
  }, [getFreshWallet, stopNotificationTimer]);

  useEffect(() => {
    if (!user?.$id) return;

    refresh();

    const interval = setInterval(() => {
      refresh();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user?.$id, refresh]);

  // ----------------------------------------------------
  // SAVE ZANGI CONTACT
  // ----------------------------------------------------

  async function saveZangi() {
    setErrorMessage("");
    setSuccessMessage("");

    const contact = normaliseContact(zangiInput);

    if (!contact) {
      reportError("Enter your Zangi ID or number first.");
      return;
    }

    if (!user?.$id || !wallet?.$id) {
      reportError("Your wallet is not ready.");
      return;
    }

    setSavingZangi(true);

    try {
      const updated = await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { zangiContact: contact }
      );

      if (!mountedRef.current) return;

      setWallet(updated);
      setZangiInput(contact);
      setShowZangiPopup(false);

      reportSuccess("Your Zangi ID has been saved.");
    } catch (error) {
      reportError(
        error?.message || "Unable to save your Zangi ID."
      );
    } finally {
      if (mountedRef.current) {
        setSavingZangi(false);
      }
    }
  }

  // ----------------------------------------------------
  // ROOM SELECTION AND VALIDATION
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

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error(
        "Enter a valid whole-number coin stake."
      );
    }

    const roomKey = getRoomForStake(amount);

    if (!roomKey) {
      throw new Error(
        "Choose a valid stake: 100–350, 400–1,000, or 1,100+ coins."
      );
    }

    return { amount, roomKey };
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

    let deductedAmount = 0;

    try {
      if (!user?.$id) {
        throw new Error("Please sign in first.");
      }

      const { amount, roomKey } = validateStake();

      if (!wallet?.zangiContact) {
        setShowZangiPopup(true);
        throw new Error(
          "Save your Zangi ID before creating a match."
        );
      }

      const freshWallet = await getFreshWallet(user.$id);
      const freshCoins = getAvailableBalance(freshWallet);

      if (freshCoins < amount) {
        throw new Error(
          `Insufficient coins. Your balance is ${formatCoins(
            freshCoins
          )}, but this match requires ${formatCoins(
            amount
          )} coins.`
        );
      }

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        { coins: freshCoins - amount }
      );

      deductedAmount = amount;

      await databases.createDocument(
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
          hostZangiContact: freshWallet.zangiContact || "",
          room: roomKey,
          adminCut: 0,
        }
      );

      deductedAmount = 0;

      setStake(String(amount));
      setSelectedRoom(roomKey);

      reportSuccess(
        `Match created. ${formatCoins(
          amount
        )} coins have been reserved. Waiting for an opponent.`
      );

      await refresh();
    } catch (error) {
      if (deductedAmount > 0 && user?.$id) {
        try {
          const latestWallet = await getFreshWallet(user.$id);

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            latestWallet.$id,
            {
              coins:
                getAvailableBalance(latestWallet) + deductedAmount,
            }
          );
        } catch (refundError) {
          console.error(
            "Automatic refund failed:",
            refundError
          );

          reportError(
            "Match creation failed and the automatic refund could not be confirmed. Please contact support before retrying."
          );

          return;
        }
      }

      reportError(
        error?.message || "Unable to create the match."
      );
    } finally {
      actionLockRef.current = false;
      setCreating(false);
    }
  }
  // ----------------------------------------------------
  // JOIN OR RECOVER MATCH
  // ----------------------------------------------------

  async function joinMatch(match) {
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setLoadingJoin(match.$id);
    setErrorMessage("");
    setSuccessMessage("");

    let deductedAmount = 0;
    let claimed = false;

    try {
      if (!user?.$id) {
        throw new Error("Please sign in first.");
      }

      if (match.hostId === user.$id) {
        throw new Error("You cannot join your own match.");
      }

      const freshWallet = await getFreshWallet(user.$id);

      if (!freshWallet.zangiContact) {
        setShowZangiPopup(true);
        throw new Error(
          "Save your Zangi ID before joining a match."
        );
      }

      const freshMatch = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      // RECOVERY:
      // If this player already claimed the match, never deduct
      // the stake again.
      if (
        freshMatch.opponentId === user.$id &&
        ["matched", "playing"].includes(freshMatch.status)
      ) {
        const recoveredGame =
          await ensureGameForMatch(freshMatch);

        reportSuccess(
          "Your previous match setup has been repaired."
        );

        await refresh();

        openGameOnce(recoveredGame.$id, freshMatch.stake);

        return;
      }

      if (!isWaitingMatch(freshMatch)) {
        throw new Error(
          "This match is no longer available. Refresh the lobby."
        );
      }

      const amount = Number(freshMatch.stake);

      if (
        !Number.isSafeInteger(amount) ||
        !getRoomForStake(amount)
      ) {
        throw new Error(
          "This match has an invalid stake or room configuration."
        );
      }

      const freshCoins = getAvailableBalance(freshWallet);

      if (freshCoins < amount) {
        throw new Error(
          `Insufficient coins to join. You have ${formatCoins(
            freshCoins
          )} coins, but joining requires ${formatCoins(
            amount
          )} coins.`
        );
      }

      // IMPORTANT:
      // Client-side wallet updates are not atomic. A trusted
      // server-side transaction is needed to eliminate races
      // between two devices attempting to join simultaneously.
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        { coins: freshCoins - amount }
      );

      deductedAmount = amount;

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
          opponentZangiContact: freshWallet.zangiContact || "",
          adminCut,
          pot: prizePot,
        }
      );

      claimed = true;
      deductedAmount = 0;

      // Create or recover the game before attempting commission.
      const game = await ensureGameForMatch(claimedMatch);

      await refresh();

      notify(
        "Your opponent has joined. Opening the Whot game.",
        "opponent"
      );

      openGameOnce(game.$id, amount);

      // Commission is calculated ONCE from the combined stakes.
      // The remaining pot is paid to the winner by Whot.jsx.
      try {
        const adminWallet = await getAdminWallet();
        const adminCoins = getAvailableBalance(adminWallet);

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          adminWallet.$id,
          { coins: adminCoins + adminCut }
        );
      } catch (commissionError) {
        console.error(
          "Admin commission could not be confirmed:",
          commissionError
        );

        notify(
          "The game is ready, but the admin commission could not be confirmed. Review the admin wallet before making any manual adjustment.",
          "error"
        );
      }

      reportSuccess(
        `Match started. Combined stake: ${formatCoins(
          totalCollected
        )} coins. Winner's prize: ${formatCoins(
          prizePot
        )} coins.`
      );
    } catch (error) {
      if (deductedAmount > 0 && user?.$id && !claimed) {
        try {
          const latestWallet = await getFreshWallet(user.$id);

          await databases.updateDocument(
            DATABASE_ID,
            WALLET_COLLECTION,
            latestWallet.$id,
            {
              coins:
                getAvailableBalance(latestWallet) + deductedAmount,
            }
          );
        } catch (refundError) {
          console.error("Joining refund failed:", refundError);

          reportError(
            "Joining failed and the automatic refund could not be confirmed. Contact support before trying again."
          );

          return;
        }
      }

      if (claimed) {
        console.error(
          "Match claimed, but a later setup step failed:",
          error
        );

        reportError(
          "Your match was claimed, but game setup did not finish. Use Repair / Open Game. Do not pay the stake again."
        );

        await refresh().catch(() => {});
        return;
      }

      reportError(
        error?.message || "Unable to join this match."
      );
    } finally {
      actionLockRef.current = false;
      setLoadingJoin("");
    }
  }

  // ----------------------------------------------------
  // REPAIR MATCH / OPEN GAME
  // ----------------------------------------------------

  async function repairAndOpenGame(match) {
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setRepairingMatch(match.$id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const freshMatch = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (
        freshMatch.hostId !== user?.$id &&
        freshMatch.opponentId !== user?.$id
      ) {
        throw new Error(
          "You are not a player in this match."
        );
      }

      if (!freshMatch.opponentId) {
        throw new Error(
          "Waiting for an opponent to join this match."
        );
      }

      const game = await ensureGameForMatch(freshMatch);

      await refresh();

      reportSuccess("Game setup verified. Opening Whot.");

      openGameOnce(game.$id, freshMatch.stake);
    } catch (error) {
      console.error("Match recovery failed:", error);

      reportError(
        error?.message ||
          "Unable to repair this game. Check the Appwrite games collection attributes."
      );
    } finally {
      actionLockRef.current = false;
      setRepairingMatch("");
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
        throw new Error(
          "This match has already been refunded."
        );
      }

      const amount = Number(freshMatch.stake);

      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
      ) {
        throw new Error("The match stake is invalid.");
      }

      const freshWallet = await getFreshWallet(user.$id);

      // NOTE:
      // These two writes are not atomic. If either write fails,
      // check the match and wallet before manually issuing a refund.
      // A server-side transaction is needed for a guaranteed
      // exactly-once refund.
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
          coins: getAvailableBalance(freshWallet) + amount,
        }
      );

      reportSuccess(
        `Match cancelled. ${formatCoins(amount)} coins refunded.`
      );

      await refresh();
    } catch (error) {
      reportError(
        error?.message || "Unable to cancel this match."
      );
    } finally {
      actionLockRef.current = false;
    }
  }

  // ----------------------------------------------------
  // OPEN OPPONENT ZANGI
  // ----------------------------------------------------

  function openZangi(match) {
    const opponentContact = getOpponentZangi(
      match,
      user?.$id
    );

    if (!opponentContact) {
      reportError(
        "Your opponent has not provided a Zangi ID yet."
      );
      return;
    }

    const zangiUrl =
      buildZangiConversationUrl(opponentContact);

    if (!zangiUrl) {
      reportError("The opponent's Zangi ID is invalid.");
      return;
    }

    notify(
      "Opening your opponent's Zangi conversation.",
      "info",
      { speak: false, sound: true }
    );

    window.location.assign(zangiUrl);
  }

  // ----------------------------------------------------
  // RESUME GAME
  // ----------------------------------------------------

  function resumeGame(match) {
    const gameId = match.gameId || match.game?.$id || "";

    if (!gameId) {
      repairAndOpenGame(match);
      return;
    }

    openGameOnce(gameId, match.stake);
  }

  // ----------------------------------------------------
  // LOADING STATE
  // ----------------------------------------------------

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <section style={styles.panel}>
            <h2 style={styles.sectionTitle}>
              Loading Win9ja Life...
            </h2>

            <p style={styles.sectionText}>
              Preparing your wallet and game lobby.
            </p>
          </section>
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
        <header style={styles.header}>
          <div>
            <h1 style={styles.brand}>
              Win9ja <span style={styles.brandAccent}>Life</span>
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

        {/* VOICE AND SOUND CONTROLS */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            🔔 Voice & Sound Notifications
          </h2>

          <p style={styles.sectionText}>
            Enable this on your device to hear alerts for errors,
            successful actions and opponent activity while the app is open.
          </p>

          <div style={styles.buttonRow}>
            <button
              type="button"
              onClick={enableVoiceAndSound}
              style={{
                ...styles.button,
                ...styles.primaryButton,
              }}
            >
              {voiceEnabled && soundEnabled
                ? "✓ Voice & Sound Enabled"
                : "Enable Voice & Sound"}
            </button>

            <button
              type="button"
              onClick={() => {
                setVoiceEnabled(false);
                setSoundEnabled(false);

                if ("speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }

                setSuccessMessage(
                  "Voice and sound notifications disabled."
                );
                setErrorMessage("");
              }}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
              }}
            >
              Mute
            </button>
          </div>

          <div style={{ ...styles.muted, marginTop: 10 }}>
            Voice: {voiceEnabled ? "Enabled" : "Disabled"} · Sound:{" "}
            {soundEnabled ? "Enabled" : "Disabled"}
          </div>
        </section>

        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            style={styles.error}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            style={styles.success}
          >
            ✓ {successMessage}
          </div>
        )}

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

        {/* ROOM SELECTION */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Choose Your Room
          </h2>

          <p style={styles.sectionText}>
            Select a room according to your coin stake.
          </p>

          <div style={styles.roomGrid}>
            {Object.entries(ROOM_CONFIG).map(([key, room]) => {
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
                    {room.name} {selected ? "✓" : ""}
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
                      : `${formatCoins(room.min)}–${formatCoins(
                          room.max
                        )} coins`}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* CREATE MATCH */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Create a Match
          </h2>

          <p style={styles.sectionText}>
            Choose your stake and wait for another player. Your stake
            will be reserved from your wallet.
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

                  const room = getRoomForStake(Number(value));

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
                Your Zangi ID
              </label>

              <input
                id="lobby-zangi"
                type="text"
                value={zangiInput}
                onChange={(event) =>
                  setZangiInput(event.target.value)
                }
                style={styles.input}
                placeholder="Enter your Zangi ID or number"
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
                : `Create Match · ${formatCoins(
                    Number(stake) || 0
                  )} Coins`}
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
              {savingZangi ? "Saving..." : "Save Zangi ID"}
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
            Join another player's waiting match using the displayed stake.
          </p>

          {matches.length === 0 ? (
            <div style={styles.empty}>
              No waiting matches at the moment.
              <br />
              Create a match and wait for another player to join.
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

                  <div style={styles.muted}>Host</div>

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
                    Both players stake the same number of coins.
                  </div>

                  <div style={styles.buttonRow}>
                    <button
                      type="button"
                      disabled={Boolean(loadingJoin)}
                      onClick={() => joinMatch(match)}
                      style={{
                        ...styles.button,
                        ...styles.primaryButton,
                        width: "100%",
                        opacity: loadingJoin ? 0.6 : 1,
                      }}
                    >
                      {loadingJoin === match.$id
                        ? "Joining..."
                        : `Join · ${formatCoins(
                            match.stake
                          )} Coins`}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ACTIVE MATCHES */}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Your Active Matches
          </h2>

          <p style={styles.sectionText}>
            Continue matches that you have created or joined.
          </p>

          {activeMatches.length === 0 ? (
            <div style={styles.empty}>
              You have no active matches.
            </div>
          ) : (
            <div style={styles.matchList}>
              {activeMatches.map((match) => {
                const isHost = match.hostId === user?.$id;

                const opponentId = isHost
                  ? match.opponentId
                  : match.hostId;

                const game =
                  match.game || gameMap[match.gameId];

                const opponentContact = getOpponentZangi(
                  match,
                  user?.$id
                );

                const turnInfo = getTurnInfo(
                  game,
                  user?.$id
                );

                const turnColor =
                  turnInfo.status === "mine"
                    ? "#22c55e"
                    : turnInfo.status === "opponent"
                      ? "#f59e0b"
                      : "#64748b";

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

                    {/* TURN INDICATOR */}

                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 13px",
                        margin: "12px 0",
                        borderRadius: 12,
                        background: "#071321",
                        border: `1px solid ${turnColor}`,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: "inline-block",
                          width: 13,
                          height: 13,
                          minWidth: 13,
                          borderRadius: "50%",
                          background: turnColor,
                          boxShadow: `0 0 12px ${turnColor}`,
                        }}
                      />

                      <div>
                        <div
                          style={{
                            color: turnColor,
                            fontSize: 14,
                            fontWeight: 900,
                          }}
                        >
                          {turnInfo.label}
                        </div>

                        <div style={styles.muted}>
                          {turnInfo.status === "mine"
                            ? "It's your move."
                            : turnInfo.status === "opponent"
                              ? "Wait for your opponent to play."
                              : "Turn information is not available yet."}
                        </div>
                      </div>
                    </div>

                    <div style={styles.muted}>
                      Your Stake
                    </div>

                    <div style={styles.matchAmount}>
                      🪙 {formatCoins(match.stake)}
                    </div>

                    <div style={styles.muted}>
                      Winner's potential prize:{" "}
                      {formatCoins(match.pot)} coins
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
                        Opponent Zangi ID: {opponentContact}
                      </div>
                    )}

                    <div style={styles.buttonRow}>
                      <button
                        type="button"
                        disabled={
                          repairingMatch === match.$id
                        }
                        onClick={() => resumeGame(match)}
                        style={{
                          ...styles.button,
                          ...styles.primaryButton,
                          opacity:
                            repairingMatch === match.$id
                              ? 0.6
                              : 1,
                        }}
                      >
                        {repairingMatch === match.$id
                          ? "Repairing..."
                          : match.gameId
                            ? "Resume Game"
                            : "Repair / Open Game"}
                      </button>

                      {opponentId && (
                        <button
                          type="button"
                          onClick={() => openZangi(match)}
                          style={{
                            ...styles.button,
                            ...styles.secondaryButton,
                          }}
                        >
                          💬 Contact Opponent
                        </button>
                      )}

                      {isHost && isWaitingMatch(match) && (
                        <button
                          type="button"
                          onClick={() => cancelMatch(match)}
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
                        The game is finished. Verify the result
                        and payout status before making any manual
                        wallet adjustment.
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
            The current rule calculates a 20% admin commission from
            the combined stakes, with the remaining 80% reserved for
            the winner.
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
            Example: two players stake 500 coins each. Combined
            stakes: 1,000 coins. Admin commission: 200 coins.
            Winner's prize: 800 coins.
          </div>
        </section>
      </div>

      {/* LIVE NOTIFICATION */}

      {notification && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...styles.notification,
            background:
              notification.type === "error"
                ? "#451b26"
                : notification.type === "success"
                  ? "#123a2b"
                  : "#153a34",
            borderColor:
              notification.type === "error"
                ? "#ef4444"
                : notification.type === "success"
                  ? "#22c55e"
                  : notification.type === "opponent"
                    ? "#a78bfa"
                    : "#38bdf8",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: 6,
            }}
          >
            {notification.type === "error"
              ? "⚠️ Action Failed"
              : notification.type === "success"
                ? "✅ Success"
                : notification.type === "opponent"
                  ? "🎮 Opponent Notification"
                  : "🔔 Win9ja Life"}
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {notification.message}
          </div>

          <button
            type="button"
            onClick={() => {
              setNotification(null);
              stopNotificationTimer();
            }}
            style={{
              ...styles.button,
              ...styles.secondaryButton,
              marginTop: 10,
              padding: "7px 12px",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ZANGI SETUP POPUP */}

      {showZangiPopup && (
        <div style={styles.popupOverlay}>
          <div
            style={styles.popup}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zangi-popup-title"
          >
            <h2
              id="zangi-popup-title"
              style={styles.popupTitle}
            >
              Set Up Your Zangi Contact
            </h2>

            <p style={styles.popupText}>
              Add your Zangi ID or phone number. Win9ja Life will
              use the saved contact to build a conversation link
              for your opponent.
            </p>

            <label
              htmlFor="zangi-popup-input"
              style={styles.fieldLabel}
            >
              Zangi ID or Number
            </label>

            <input
              id="zangi-popup-input"
              type="text"
              value={zangiInput}
              onChange={(event) =>
                setZangiInput(event.target.value)
              }
              style={styles.input}
              placeholder="Enter Zangi ID or number"
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
                onClick={() => setShowZangiPopup(false)}
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