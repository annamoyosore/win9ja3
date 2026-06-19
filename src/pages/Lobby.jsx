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
const ADMIN_ID = "69ef9fe863a02a7490b4";
const ZANGI_LINK = "https://services.zangi.com/dl/conversation/";

// =========================
// SOUND
// =========================
function playTurnSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.setValueAtTime(980, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(620, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {}
}

// =========================
// CREATE GAME
// =========================
async function createGame(match, opponentId) {
  return await databases.createDocument(
    DATABASE_ID,
    GAME_COLLECTION,
    ID.unique(),
    {
      matchId: match.$id,
      players: `${match.hostId},${opponentId}`,
      status: "running",
      turn: match.hostId,
      payoutDone: false
    }
  );
}

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [zangiMap, setZangiMap] = useState({});

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  const notifiedTurns = useRef({});

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();

    if ("Notification" in window) Notification.requestPermission();

    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    await autoRefundExpiredMatches(u.$id);
    refresh(u.$id);
  }

  useEffect(() => {
    if (!user) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,
      () => refresh(user.$id)
    );

    return () => unsub();
  }, [user]);

  async function refresh(userId) {
    await Promise.all([loadMatches(userId), loadActiveMatches(userId)]);
  }
// =========================
  // TURN ALERT
  // =========================
  useEffect(() => {
    if (!user) return;

    activeMatches.forEach((m) => {
      const game = gameMap[m.gameId];
      if (!game || game.status === "finished") return;

      if (game.turn === user.$id) {
        if (notifiedTurns.current[m.gameId]) return;

        notifiedTurns.current[m.gameId] = true;

        playTurnSound();

        if (navigator.vibrate) navigator.vibrate([300, 120, 300]);

        if (
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("🎮 Win9ja", {
            body: "It's your turn!",
            icon: "/icon192.png"
          });
        }
      } else {
        notifiedTurns.current[m.gameId] = false;
      }
    });
  }, [activeMatches, gameMap, user]);

  // =========================
  // ZANGI CHAT
  // =========================
  function openZangi(userId) {
    const z = zangiMap[userId];
    if (!z) return alert("No Zangi contact");

    const msg = encodeURIComponent(
      "Hey! Let’s continue our Win9ja game on Zangi → https://services.zangi.com/dl/conversation/"
    );

    window.open(`${ZANGI_LINK}${z}?text=${msg}`, "_blank");
  }

  async function loadWalletZangi(userIds) {
    if (!userIds.length) return;

    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userIds)]
    );

    const map = {};
    res.documents.forEach((w) => (map[w.userId] = w.zangi || ""));
    setZangiMap(map);
  }

  // =========================
  // MATCH LOADERS
  // =========================
  async function loadMatches(userId) {
    const res = await databases.listDocuments(DATABASE_ID, MATCH_COLLECTION, [
      Query.limit(100)
    ]);

    setMatches(
      res.documents.filter(
        (m) => m.status === "waiting" && !m.opponentId && m.hostId !== userId
      )
    );
  }

  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(DATABASE_ID, MATCH_COLLECTION, [
      Query.limit(100),
      Query.orderDesc("$createdAt")
    ]);

    const mine = res.documents.filter(
      (m) => m.hostId === userId || m.opponentId === userId
    );

    setActiveMatches(mine);

    const map = {};
    const ids = [];

    for (const m of mine) {
      if (m.gameId) {
        try {
          map[m.gameId] = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            m.gameId
          );
        } catch {}
      }

      if (m.hostId) ids.push(m.hostId);
      if (m.opponentId) ids.push(m.opponentId);
    }

    setGameMap(map);
    await loadWalletZangi([...new Set(ids)]);
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loadingJoin) return;

    setLoadingJoin(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.status !== "waiting" || fresh.opponentId)
        throw new Error("Taken");

      if ((wallet?.balance || 0) < fresh.stake)
        throw new Error("No balance");

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: wallet.balance - fresh.stake }
      );

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched"
        }
      );

      const game = await createGame(fresh, user.$id);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        { gameId: game.$id }
      );

      goGame(game.$id, fresh.stake);
    } catch (e) {
      alert(e.message);
    }

    setLoadingJoin(null);
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    if (creating) return;

    const amount = Number(stake);

    if (!amount || amount < 50) return alert("Min ₦50");

    if ((wallet?.balance || 0) < amount)
      return alert("Insufficient balance");

    setCreating(true);

    try {
      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        wallet.$id,
        { balance: wallet.balance - amount }
      );

      await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: user.$id,
          stake: amount,
          status: "waiting",
          refundDone: false
        }
      );

      setStake("");
    } catch (e) {
      alert(e.message);
    }

    setCreating(false);
  }

  // =========================
  // LIMIT
  // =========================
  function canPlayMore() {
    return activeMatches.filter((m) => m.status !== "finished").length < 7;
  }
const styles = {
  container: {
    padding: 20,
    background: "#020617",
    color: "#fff",
    minHeight: "100vh"
  },

  card: {
    background: "#111827",
    padding: 12,
    margin: "10px 0",
    display: "flex",
    justifyContent: "space-between",
    borderRadius: 12
  },

  joinBtn: {
    background: "gold",
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    fontWeight: "bold"
  },

  resumeBtn: {
    background: "#16a34a",
    padding: "10px 18px",
    borderRadius: 10,
    color: "#fff",
    border: "none",
    fontWeight: "bold"
  },

  // 🔥 RED CREATE BUTTON
  createBtn: {
    background: "red",
    padding: "12px 18px",
    borderRadius: 10,
    color: "#fff",
    border: "none",
    fontWeight: "bold"
  },

  zangiBtn: {
    background: "#0ea5e9",
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    color: "#fff"
  }
};