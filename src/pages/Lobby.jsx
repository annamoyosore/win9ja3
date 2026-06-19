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

// =========================
// ZANGI
// =========================
const ZANGI_LINK =
  "https://services.zangi.com/dl/conversation/";

// =========================
// 🎵 WIN9JA TURN SOUND
// =========================
function playTurnSound() {
  try {
    const ctx =
      new (window.AudioContext || window.webkitAudioContext)();

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

  } catch (err) {
    console.log("Sound failed");
  }
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

  // =========================
  // ZANGI CONTACTS
  // =========================
  const [zangiMap, setZangiMap] = useState({});

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  // 🔔 TURN ALERT TRACKER
  const notifiedTurns = useRef({});

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();

    // 🔔 notification permission
    if ("Notification" in window) {
      Notification.requestPermission();
    }

    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) {
      setWallet(w.documents[0]);
    }

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

  // =========================
  // LOAD ZANGI CONTACTS
  // =========================
  async function loadWalletZangi(userIds) {
    if (!userIds.length) return;

    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [
          Query.equal(
            "userId",
            [...new Set(userIds)]
          )
        ]
      );

      const map = {};

      res.documents.forEach((w) => {
        map[w.userId] = w.zangi || "";
      });

      setZangiMap(map);

    } catch (err) {
      console.log(err);
    }
  }

  // =========================
  // OPEN ZANGI CHAT
  // =========================
  function openZangi(userId) {
    const zangi = zangiMap[userId];

    if (!zangi) {
      return alert(
        "Opponent has not saved a Zangi contact yet."
      );
    }

    const message = encodeURIComponent(
      "Hey! Let’s chat securely on Zangi Messenger and finish our Win9ja game. If you don’t have Zangi, get it free via this link → https://services.zangi.com/dl/conversation/"
    );

    window.open(
      `${ZANGI_LINK}${zangi}?text=${message}`,
      "_blank"
    );
  }

  // =========================
  // 🔔 TURN ALERT
  // =========================
useEffect(() => {
  if (!user) return;

  activeMatches.forEach((m) => {
    const game = gameMap[m.gameId];

    if (!game) return;
    if (game.status === "finished") return;

    if (game.turn === user.$id) {
      if (notifiedTurns.current[m.gameId]) return;

      notifiedTurns.current[m.gameId] = true;

      playTurnSound();

      if (navigator.vibrate) {
        navigator.vibrate([300, 120, 300]);
      }

      if (
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("🎮 Win9ja", {
          body: "It's your turn to play!",
          icon: "/icon192.png"
        });
      }

    } else {
      notifiedTurns.current[m.gameId] = false;
    }
  });
}, [activeMatches, gameMap, user]);

// =========================
// REFRESH
// =========================
async function refresh(userId) {
  await Promise.all([
    loadMatches(userId),
    loadActiveMatches(userId)
  ]);
}

// =========================
// AUTO REFUND (78 HOURS)
// =========================
async function autoRefundExpiredMatches(userId) {
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("hostId", userId),
        Query.equal("status", "waiting"),
        Query.equal("refundDone", false),
        Query.limit(100)
      ]
    );

    const now = Date.now();

    for (const m of res.documents) {
      if (m.opponentId) continue;

      const created = new Date(m.$createdAt).getTime();
      const diff = (now - created) / (1000 * 60 * 60);

      if (diff < 78) continue;

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        m.$id,
        {
          status: "expired",
          refundDone: true
        }
      );

      const walletRes = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", m.hostId), Query.limit(1)]
      );

      if (!walletRes.documents.length) continue;

      const w = walletRes.documents[0];

      await databases.updateDocument(
        DATABASE_ID,
        WALLET_COLLECTION,
        w.$id,
        {
          balance: Number(w.balance || 0) + Number(m.stake || 0)
        }
      );
    }
  } catch (err) {
    console.error("Refund error:", err);
  }
}

// =========================
// LOAD MATCHES
// =========================
async function loadMatches(userId) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    MATCH_COLLECTION,
    [Query.limit(100)]
  );

  const available = res.documents.filter(
    (m) =>
      m.status === "waiting" &&
      !m.opponentId &&
      m.hostId !== userId
  );

  setMatches(available);
}

// =========================
// LOAD ACTIVE MATCHES + ZANGI
// =========================
const [zangiMap, setZangiMap] = useState({}); // 👈 keep inside component top

async function loadActiveMatches(userId) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    MATCH_COLLECTION,
    [Query.limit(100), Query.orderDesc("$createdAt")]
  );

  const mine = res.documents.filter(
    (m) =>
      m.hostId === userId || m.opponentId === userId
  );

  setActiveMatches(mine);

  const map = {};
  const userIds = [];

  for (const m of mine) {
    if (m.gameId) {
      try {
        const g = await databases.getDocument(
          DATABASE_ID,
          GAME_COLLECTION,
          m.gameId
        );
        map[m.gameId] = g;
      } catch {}
    }

    if (m.hostId) userIds.push(m.hostId);
    if (m.opponentId) userIds.push(m.opponentId);
  }

  setGameMap(map);
  await loadWalletZangi([...new Set(userIds)]);
}

// =========================
// LOAD ZANGI FROM WALLET
// =========================
async function loadWalletZangi(userIds) {
  if (!userIds.length) return;

  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", userIds)]
    );

    const map = {};

    res.documents.forEach((w) => {
      map[w.userId] = w.zangi || "";
    });

    setZangiMap(map);
  } catch (err) {
    console.log("Zangi load error", err);
  }
}

// =========================
// LIMIT CHECK
// =========================
function canPlayMore() {
  return activeMatches.filter(
    (m) => m.status !== "finished"
  ).length < 7;
}

// =========================
// JOIN MATCH
// =========================
async function joinMatch(match) {
  if (loadingJoin) return;

  if (!canPlayMore()) {
    return alert("Max 7 running matches reached");
  }

  setLoadingJoin(match.$id);

  try {
    const fresh = await databases.getDocument(
      DATABASE_ID,
      MATCH_COLLECTION,
      match.$id
    );

    if (fresh.status !== "waiting" || fresh.opponentId) {
      throw new Error("Already taken");
    }

    if ((wallet?.balance || 0) < fresh.stake) {
      throw new Error("Insufficient balance");
    }

    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: wallet.balance - fresh.stake
      }
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

  } catch (err) {
    alert(err.message);
  }

  setLoadingJoin(null);
}

// =========================
// CREATE MATCH
// =========================
async function createMatch() {
  if (creating) return;

  if (!canPlayMore()) {
    return alert("Max 7 running matches");
  }

  const amount = Number(stake);

  if (!amount || amount < 50) {
    return alert("Minimum ₦50");
  }

  if ((wallet?.balance || 0) < amount) {
    return alert("Insufficient balance");
  }

  setCreating(true);

  try {
    await databases.updateDocument(
      DATABASE_ID,
      WALLET_COLLECTION,
      wallet.$id,
      {
        balance: wallet.balance - amount
      }
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
  } catch (err) {
    alert(err.message);
  }

  setCreating(false);
}