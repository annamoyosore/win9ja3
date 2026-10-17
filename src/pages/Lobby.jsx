import { useEffect, useRef, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

const GAME_COLLECTION = "games";

const ROOM_CONFIG = {
  beginners: {
    label: "Beginners",
    emoji: "🟢",
    min: 100,
    max: 350,
    description: "Start your WHOT journey."
  },
  standard: {
    label: "Standard",
    emoji: "🔵",
    min: 400,
    max: 1000,
    description: "For regular WHOT players."
  },
  premium: {
    label: "Premium",
    emoji: "🟡",
    min: 1100,
    max: Infinity,
    description: "Higher-stake competition."
  }
};

function getRoomForStake(amount) {
  if (amount >= 100 && amount <= 350) return "beginners";
  if (amount >= 400 && amount <= 1000) return "standard";
  if (amount >= 1100) return "premium";
  return null;
}

function formatCoins(value) {
  return `${Number(value || 0).toLocaleString()} coins`;
}

function getOpponentZangi(match, userId) {
  if (!match || !userId) return "";

  if (match.hostId === userId) {
    return match.opponentZangiContact || "";
  }

  if (match.opponentId === userId) {
    return match.hostZangiContact || "";
  }

  return "";
}

function parsePlayers(players) {
  if (Array.isArray(players)) return players;

  if (typeof players !== "string" || !players.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(players);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  return players.split(",").map(p => p.trim()).filter(Boolean);
}

/* =========================
   STYLES
========================= */

const styles = {
  container: {
    padding: 18,
    background: "linear-gradient(180deg,#020617,#0f172a)",
    color: "#fff",
    minHeight: "100vh",
    fontFamily: "system-ui,sans-serif"
  },

  title: {
    fontSize: 27,
    fontWeight: 900,
    marginBottom: 5
  },

  subtitle: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 20
  },

  balanceBox: {
    background: "#172554",
    border: "1px solid #2563eb",
    padding: 15,
    borderRadius: 14,
    marginBottom: 20
  },

  balanceLabel: {
    color: "#bfdbfe",
    fontSize: 12
  },

  balanceAmount: {
    fontSize: 24,
    fontWeight: 900,
    marginTop: 5
  },

  section: {
    marginTop: 24,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: 800
  },

  roomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12
  },

  roomCard: {
    background: "linear-gradient(145deg,#111827,#1e293b)",
    padding: 17,
    borderRadius: 16,
    border: "1px solid #334155"
  },

  roomName: {
    fontSize: 19,
    fontWeight: 900
  },

  roomDescription: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 5
  },

  roomRange: {
    color: "#facc15",
    fontWeight: 800,
    marginTop: 10
  },

  card: {
    background: "#111827",
    padding: 14,
    margin: "12px 0",
    borderRadius: 14,
    border: "1px solid #334155"
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },

  stake: {
    fontSize: 16,
    fontWeight: 900
  },

  status: {
    fontSize: 12,
    color: "#cbd5e1"
  },

  turn: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: 800,
    color: "#facc15"
  },

  btn: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 800,
    marginTop: 9
  },

  disabledBtn: {
    opacity: 0.55,
    cursor: "not-allowed"
  },

  chatBtn: {
    background: "#2563eb",
    color: "#fff"
  },

  resumeBtn: {
    background: "#16a34a",
    color: "#fff"
  },

  joinBtn: {
    background: "#facc15",
    color: "#111827",
    padding: "10px 15px",
    borderRadius: 10,
    border: "none",
    fontWeight: 900,
    cursor: "pointer"
  },

  input: {
    boxSizing: "border-box",
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #475569",
    background: "#020617",
    color: "#fff",
    marginTop: 10,
    outline: "none"
  },

  createBtn: {
    width: "100%",
    padding: 13,
    borderRadius: 11,
    background: "#f59e0b",
    color: "#111827",
    border: "none",
    fontWeight: 900,
    marginTop: 12,
    cursor: "pointer"
  },

  notice: {
    background: "#422006",
    border: "1px solid #a16207",
    padding: 12,
    borderRadius: 10,
    color: "#fef3c7",
    fontSize: 13,
    marginTop: 12
  },

  error: {
    background: "#450a0a",
    border: "1px solid #991b1b",
    padding: 12,
    borderRadius: 10,
    color: "#fecaca",
    marginTop: 12,
    fontSize: 13
  },

  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(2,6,23,0.94)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    overflowY: "auto"
  },

  modal: {
    width: "100%",
    maxWidth: 430,
    background: "linear-gradient(160deg,#111827,#172554)",
    border: "1px solid #475569",
    borderRadius: 20,
    padding: 22,
    position: "relative",
    boxShadow: "0 25px 80px rgba(0,0,0,0.55)"
  },

  closeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #475569",
    background: "#0f172a",
    color: "#fff",
    fontSize: 20,
    cursor: "pointer"
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: 900,
    margin: "6px 35px 10px 0"
  },

  modalText: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 1.65
  },

  modalLabel: {
    display: "block",
    fontSize: 13,
    fontWeight: 800,
    marginTop: 18
  },

  saveBtn: {
    width: "100%",
    padding: 13,
    borderRadius: 11,
    border: "none",
    background: "#22c55e",
    color: "#052e16",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 12
  },

  filledBtn: {
    width: "100%",
    padding: 12,
    borderRadius: 11,
    border: "1px solid #475569",
    background: "#1e293b",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    marginTop: 9
  }
};
/* =========================
   LOBBY COMPONENT
========================= */

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});

  const [stake, setStake] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("beginners");

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);
  const [savingZangi, setSavingZangi] = useState(false);

  const [zangiInput, setZangiInput] = useState("");
  const [showZangiPopup, setShowZangiPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const mountedRef = useRef(true);
  const actionLockRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    init();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =========================
     LOAD USER AND WALLET
  ========================= */

  async function init() {
    setLoading(true);
    setErrorMessage("");

    try {
      const currentUser = await account.get();

      if (!mountedRef.current) return;

      setUser(currentUser);

      const walletResult = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [
          Query.equal("userId", currentUser.$id),
          Query.limit(1)
        ]
      );

      if (!mountedRef.current) return;

      const currentWallet = walletResult.documents[0] || null;

      setWallet(currentWallet);

      if (currentWallet?.zangiContact) {
        setZangiInput(currentWallet.zangiContact);
        setShowZangiPopup(false);
      } else {
        setShowZangiPopup(true);
      }

      await refresh(currentUser.$id);
    } catch (err) {
      console.error("Lobby initialization failed:", err);

      if (mountedRef.current) {
        setErrorMessage(
          "Unable to load your account or wallet. Please sign in again and retry."
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  async function getFreshWallet(userId) {
    const result = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [
        Query.equal("userId", userId),
        Query.limit(1)
      ]
    );

    if (!result.documents.length) {
      throw new Error("Your wallet was not found. Please contact support.");
    }

    const freshWallet = result.documents[0];

    if (mountedRef.current) {
      setWallet(freshWallet);
    }

    return freshWallet;
  }

  function getAvailableBalance(currentWallet) {
    const balance = Number(currentWallet?.balance);

    if (!Number.isFinite(balance) || balance < 0) {
      return 0;
    }

    const locked = Number(currentWallet?.lockedBalance || 0);

    if (!Number.isFinite(locked) || locked < 0) {
      return 0;
    }

    return Math.max(0, balance - locked);
  }

  /* =========================
     ZANGI SETUP POPUP
  ========================= */

  async function saveZangi() {
    if (!user || savingZangi) return;

    const contact = zangiInput.trim();

    if (!contact) {
      alert("Please enter your Zangi ID or contact number.");
      return;
    }

    if (contact.length > 100) {
      alert("Your Zangi ID is too long.");
      return;
    }

    setSavingZangi(true);

    try {
      const freshWallet = await getFreshWallet(user.$id);

      const updated = await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        freshWallet.$id,
        {
          zangiContact: contact
        }
      );

      setWallet(updated);
      setZangiInput(updated.zangiContact || contact);
      setShowZangiPopup(false);

      alert("Your Zangi ID has been saved.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Unable to save your Zangi ID.");
    } finally {
      setSavingZangi(false);
    }
  }

  function closeZangiPopup() {
    setShowZangiPopup(false);
  }

  function useSavedZangi() {
    if (!wallet?.zangiContact) {
      alert("No saved Zangi ID was found. Please enter and save it first.");
      return;
    }

    setZangiInput(wallet.zangiContact);
    setShowZangiPopup(false);
  }

  /* =========================
     LOAD MATCHES
  ========================= */

  async function refresh(userId) {
    await Promise.all([
      loadMatches(userId),
      loadActiveMatches(userId)
    ]);
  }

  async function loadMatches(userId) {
    const result = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("status", "waiting"),
        Query.limit(100),
        Query.orderDesc("$createdAt")
      ]
    );

    const available = result.documents.filter(match => {
      const room = getRoomForStake(Number(match.stake));

      return (
        match.hostId !== userId &&
        !match.opponentId &&
        room !== null &&
        match.status === "waiting"
      );
    });

    if (mountedRef.current) {
      setMatches(available);
    }
  }

  async function loadActiveMatches(userId) {
    const result = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.limit(100),
        Query.orderDesc("$createdAt")
      ]
    );

    const mine = result.documents.filter(match => (
      match.hostId === userId ||
      match.opponentId === userId
    ));

    const map = {};

    await Promise.all(
      mine.map(async match => {
        if (!match.gameId) return;

        try {
          const game = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            match.gameId
          );

          map[match.gameId] = game;
        } catch (err) {
          console.warn("Unable to load game:", match.gameId, err);
        }
      })
    );

    if (mountedRef.current) {
      setActiveMatches(mine);
      setGameMap(map);
    }
  }

  /* =========================
     ROOM FILTERING
  ========================= */

  const roomMatches = matches.filter(match => {
    return getRoomForStake(Number(match.stake)) === selectedRoom;
  });

  function chooseRoom(roomKey) {
    setSelectedRoom(roomKey);
    setStake("");
    setErrorMessage("");
  }

  function validateStake(amount) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return "Enter a valid whole-number coin stake.";
    }

    const room = ROOM_CONFIG[selectedRoom];

    if (amount < room.min) {
      return `${room.label} requires at least ${formatCoins(room.min)}.`;
    }

    if (amount > room.max) {
      return `${room.label} allows a maximum stake of ${formatCoins(room.max)}.`;
    }

    return null;
  }

  /* =========================
     CREATE MATCH
  ========================= */

  async function createMatch() {
    if (!user || creating || actionLockRef.current) return;

    const amount = Number(stake);
    const validationError = validateStake(amount);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    actionLockRef.current = true;
    setCreating(true);
    setErrorMessage("");

    try {
      const freshWallet = await getFreshWallet(user.$id);
      const availableBalance = getAvailableBalance(freshWallet);

      if (availableBalance < amount) {
        throw new Error(
          `Insufficient available coins. You have ${formatCoins(availableBalance)}.`
        );
      }

      /*
       * This check improves the user experience.
       * Production stake reservation must be enforced server-side
       * to prevent concurrent spending or modified browser requests.
       */

      const created = await databases.createDocument(
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
          hostZangiContact: freshWallet.zangiContact || ""
        }
      );

      setStake("");

      alert(
        `Your match was created for ${formatCoins(amount)}. ` +
        "Wait for another player to join."
      );

      await refresh(user.$id);

      return created;
    } catch (err) {
      console.error("Create match failed:", err);

      setErrorMessage(
        err.message || "Unable to create the match. Please try again."
      );
    } finally {
      actionLockRef.current = false;
      setCreating(false);
    }
  }

  /* =========================
     JOIN MATCH
  ========================= */

  async function joinMatch(match) {
    if (!user || loadingJoin || actionLockRef.current) return;

    if (!match?.$id) {
      setErrorMessage("This match is invalid.");
      return;
    }

    actionLockRef.current = true;
    setLoadingJoin(match.$id);
    setErrorMessage("");

    try {
      /*
       * Re-read the match before proceeding.
       * This reduces stale-data errors, but does not by itself
       * guarantee atomic matchmaking.
       */

      const freshMatch = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (
        freshMatch.status !== "waiting" ||
        freshMatch.opponentId ||
        freshMatch.hostId === user.$id
      ) {
        throw new Error(
          "This match is no longer available. Refresh and choose another."
        );
      }

      const room = getRoomForStake(Number(freshMatch.stake));

      if (!room || room !== selectedRoom) {
        throw new Error("This match does not belong to the selected room.");
      }

      const freshWallet = await getFreshWallet(user.$id);
      const availableBalance = getAvailableBalance(freshWallet);
      const amount = Number(freshMatch.stake);

      if (availableBalance < amount) {
        throw new Error(
          `Insufficient available coins. You need ${formatCoins(amount)} ` +
          `but have ${formatCoins(availableBalance)} available.`
        );
      }

      /*
       * IMPORTANT:
       * This client-side update is not a guaranteed atomic claim.
       * Use an Appwrite Function or transaction to prevent two users
       * from successfully claiming the same waiting match.
       */

      const claimedMatch = await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        freshMatch.$id,
        {
          opponentId: user.$id,
          status: "matched",
          opponentZangiContact: freshWallet.zangiContact || ""
        }
      );

      /*
       * Create the game with the exact two players.
       */

      const players = [freshMatch.hostId, user.$id];

      const game = await databases.createDocument(
        DATABASE_ID,
        GAME_COLLECTION,
        ID.unique(),
        {
          matchId: freshMatch.$id,
          players: players.join(","),
          status: "playing",
          turn: freshMatch.hostId,
          payoutDone: false
        }
      );

      /*
       * Link the match to the created game.
       */

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        claimedMatch.$id,
        {
          gameId: game.$id,
          status: "playing"
        }
      );

      await refresh(user.$id);

      if (typeof goGame === "function") {
        goGame(game.$id, amount);
      }
    } catch (err) {
      console.error("Join match failed:", err);

      setErrorMessage(
        err.message || "Unable to join this match. Please try again."
      );

      try {
        await refresh(user.$id);
      } catch {}
    } finally {
      actionLockRef.current = false;
      setLoadingJoin(null);
    }
  }

  /* =========================
     ZANGI CHAT / CALL
  ========================= */

  async function openZangi(match) {
    if (!user) return;

    const contact = getOpponentZangi(match, user.$id);

    if (!contact) {
      alert("Your opponent has not saved a Zangi ID.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(contact);
      }
    } catch (err) {
      console.warn("Unable to copy Zangi contact:", err);
    }

    window.location.href =
      `zangi://chat?number=${encodeURIComponent(contact)}`;

    setTimeout(() => {
      window.open(
        "https://services.zangi.com/dl/conversation/",
        "_blank",
        "noopener,noreferrer"
      );
    }, 1500);
  }
  /* =========================
     LOADING STATE
  ========================= */

  if (loading) {
    return (
      <div style={styles.container}>
        <h2>Loading Win9ja Life...</h2>
        <p style={styles.subtitle}>Checking your account and wallet.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <h2>Unable to load your account</h2>
        <p>Please sign in and reopen the lobby.</p>

        {back && (
          <button
            style={{ ...styles.btn, background: "#334155", color: "#fff" }}
            onClick={back}
          >
            Back
          </button>
        )}
      </div>
    );
  }

  const availableBalance = getAvailableBalance(wallet);

  return (
    <div style={styles.container}>
      {/* =========================
          ZANGI SETUP POPUP
      ========================= */}

      {showZangiPopup && (
        <div style={styles.overlay}>
          <div
            style={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zangi-title"
          >
            <button
              type="button"
              aria-label="Close Zangi setup"
              style={styles.closeBtn}
              onClick={closeZangiPopup}
            >
              ×
            </button>

            <div style={{ fontSize: 38, marginBottom: 8 }}>
              💬
            </div>

            <h2 id="zangi-title" style={styles.modalTitle}>
              Welcome to WHOT!
            </h2>

            <p style={styles.modalText}>
              Win9ja Life lets you connect with your WHOT opponent through
              Zangi chat or calls while you play.
            </p>

            <p style={styles.modalText}>
              Save your Zangi ID below so your opponent can contact you
              when you enter a match.
            </p>

            <label style={styles.modalLabel} htmlFor="zangi-id">
              Your Zangi ID or contact
            </label>

            <input
              id="zangi-id"
              style={styles.input}
              type="text"
              autoComplete="off"
              value={zangiInput}
              onChange={event => setZangiInput(event.target.value)}
              placeholder="Enter your Zangi ID"
              maxLength={100}
            />

            <button
              type="button"
              style={{
                ...styles.saveBtn,
                ...(savingZangi ? styles.disabledBtn : {})
              }}
              disabled={savingZangi}
              onClick={saveZangi}
            >
              {savingZangi ? "Saving..." : "💾 Save Zangi ID"}
            </button>

            <button
              type="button"
              style={styles.filledBtn}
              onClick={useSavedZangi}
            >
              Already Filled In
            </button>

            <button
              type="button"
              style={{
                ...styles.filledBtn,
                background: "transparent"
              }}
              onClick={closeZangiPopup}
            >
              Continue Without Saving
            </button>

            <p
              style={{
                color: "#94a3b8",
                fontSize: 11,
                lineHeight: 1.5,
                marginTop: 14
              }}
            >
              You can close this message and continue to the game rooms.
              Your saved Zangi ID will not be erased when you close it.
            </p>
          </div>
        </div>
      )}

      {/* =========================
          LOBBY HEADER
      ========================= */}

      <h1 style={styles.title}>🎮 Win9ja Life WHOT</h1>

      <p style={styles.subtitle}>
        Choose your room, select your stake, and find an opponent.
      </p>

      <div style={styles.balanceBox}>
        <div style={styles.balanceLabel}>
          Available wallet coins
        </div>

        <div style={styles.balanceAmount}>
          🪙 {formatCoins(availableBalance)}
        </div>

        <button
          type="button"
          style={{
            ...styles.btn,
            background: "#1e40af",
            color: "#fff"
          }}
          onClick={() => init()}
        >
          🔄 Refresh Balance
        </button>
      </div>

      {errorMessage && (
        <div style={styles.error} role="alert">
          {errorMessage}
        </div>
      )}

      {/* =========================
          GAME ROOMS
      ========================= */}

      <div style={styles.section}>🏆 Choose Your Room</div>

      <div style={styles.roomGrid}>
        {Object.entries(ROOM_CONFIG).map(([key, room]) => {
          const selected = selectedRoom === key;

          return (
            <button
              type="button"
              key={key}
              onClick={() => chooseRoom(key)}
              style={{
                ...styles.roomCard,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                border: selected
                  ? "2px solid #facc15"
                  : "1px solid #334155",
                boxShadow: selected
                  ? "0 0 18px rgba(250,204,21,0.12)"
                  : "none"
              }}
            >
              <div style={styles.roomName}>
                {room.emoji} {room.label}
              </div>

              <div style={styles.roomDescription}>
                {room.description}
              </div>

              <div style={styles.roomRange}>
                {formatCoins(room.min)}
                {" — "}
                {Number.isFinite(room.max)
                  ? formatCoins(room.max)
                  : "Unlimited"}
              </div>

              {selected && (
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  ✓ Selected
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* =========================
          CREATE MATCH
      ========================= */}

      <div style={styles.section}>
        {ROOM_CONFIG[selectedRoom].emoji} Create a{" "}
        {ROOM_CONFIG[selectedRoom].label} Match
      </div>

      <div style={styles.card}>
        <div style={styles.roomDescription}>
          Choose a stake between{" "}
          {formatCoins(ROOM_CONFIG[selectedRoom].min)}
          {" and "}
          {Number.isFinite(ROOM_CONFIG[selectedRoom].max)
            ? formatCoins(ROOM_CONFIG[selectedRoom].max)
            : "any higher amount"}.
        </div>

        <input
          style={styles.input}
          type="number"
          inputMode="numeric"
          min={ROOM_CONFIG[selectedRoom].min}
          max={
            Number.isFinite(ROOM_CONFIG[selectedRoom].max)
              ? ROOM_CONFIG[selectedRoom].max
              : undefined
          }
          step="1"
          value={stake}
          onChange={event => {
            setStake(event.target.value);
            setErrorMessage("");
          }}
          placeholder={`Enter stake in coins`}
        />

        {stake && Number.isFinite(Number(stake)) && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            Selected stake:{" "}
            <strong>{formatCoins(Number(stake))}</strong>
          </div>
        )}

        <button
          type="button"
          style={{
            ...styles.createBtn,
            ...(creating ? styles.disabledBtn : {})
          }}
          disabled={creating}
          onClick={createMatch}
        >
          {creating ? "Creating Match..." : "➕ Create Match"}
        </button>

        <div style={styles.notice}>
          Your available wallet balance is checked before a match is created.
          Your balance must cover the selected stake.
        </div>
      </div>

      {/* =========================
          AVAILABLE MATCHES
      ========================= */}

      <div style={styles.section}>
        🔎 Available {ROOM_CONFIG[selectedRoom].label} Matches
      </div>

      {roomMatches.length === 0 ? (
        <div style={styles.card}>
          <p style={{ margin: 0, fontWeight: 700 }}>
            No waiting matches in this room yet.
          </p>

          <p style={styles.roomDescription}>
            Create a match or check again shortly.
          </p>

          <button
            type="button"
            style={{
              ...styles.btn,
              background: "#334155",
              color: "#fff"
            }}
            onClick={() => user && refresh(user.$id)}
          >
            🔄 Refresh Matches
          </button>
        </div>
      ) : (
        roomMatches.map(match => (
          <div key={match.$id} style={styles.card}>
            <div style={styles.row}>
              <div>
                <div style={styles.stake}>
                  🪙 {formatCoins(match.stake)}
                </div>

                <div style={styles.status}>
                  Waiting for an opponent
                </div>
              </div>

              <button
                type="button"
                style={{
                  ...styles.joinBtn,
                  ...(loadingJoin ? styles.disabledBtn : {})
                }}
                disabled={Boolean(loadingJoin)}
                onClick={() => joinMatch(match)}
              >
                {loadingJoin === match.$id ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
        ))
      )}

      {/* =========================
          ACTIVE MATCHES
      ========================= */}

      <div style={styles.section}>🔥 Your Active Matches</div>

      {activeMatches.length === 0 ? (
        <div style={styles.card}>
          <p style={{ margin: 0 }}>
            You have no active matches.
          </p>
        </div>
      ) : (
        activeMatches.map(match => {
          const game = gameMap[match.gameId];

          const isPlayer = (
            match.hostId === user.$id ||
            match.opponentId === user.$id
          );

          if (!isPlayer) return null;

          const finished = (
            match.status === "finished" ||
            game?.status === "finished"
          );

          const turnLabel = finished
            ? "Match finished"
            : game
              ? game.turn === user.$id
                ? "🟢 Your turn"
                : "🔴 Opponent's turn"
              : match.status === "waiting"
                ? "Waiting for opponent"
                : "Preparing game";

          return (
            <div key={match.$id} style={styles.card}>
              <div style={styles.row}>
                <span style={styles.stake}>
                  🪙 {formatCoins(match.stake)}
                </span>

                <span style={styles.status}>
                  {match.status}
                </span>
              </div>

              <div style={styles.turn}>
                {turnLabel}
              </div>

              {match.opponentId && (
                <button
                  type="button"
                  style={{
                    ...styles.btn,
                    ...styles.chatBtn
                  }}
                  onClick={() => openZangi(match)}
                >
                  💬 Chat / Call Opponent on Zangi
                </button>
              )}

              {match.gameId && !finished && (
                <button
                  type="button"
                  style={{
                    ...styles.btn,
                    ...styles.resumeBtn
                  }}
                  onClick={() => goGame(match.gameId, match.stake)}
                >
                  ▶ Resume Game
                </button>
              )}

              {finished && (
                <div style={styles.notice}>
                  This match has finished.
                </div>
              )}
            </div>
          );
        })
      )}

      {/* =========================
          BACK BUTTON
      ========================= */}

      {back && (
        <button
          type="button"
          style={{
            ...styles.btn,
            background: "#334155",
            color: "#fff",
            marginTop: 25
          }}
          onClick={back}
        >
          ← Back
        </button>
      )}
    </div>
  );
}