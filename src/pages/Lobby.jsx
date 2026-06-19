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

/* =========================
   UTILITIES
========================= */

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

/* =========================
   ZANGI FIX (CORE)
========================= */

function getOpponentZangi(match, userId) {
  if (!match || !userId) return null;

  if (match.hostId === userId) {
    return match.opponentZangiContact || null;
  }

  if (match.opponentId === userId) {
    return match.hostZangiContact || null;
  }

  return null;
}

/* =========================
   LOBBY
========================= */

export default function Lobby({ goGame, back }) {
  const [matches, setMatches] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [gameMap, setGameMap] = useState({});
  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [loadingJoin, setLoadingJoin] = useState(null);
  const [creating, setCreating] = useState(false);

  const notifiedTurns = useRef({});

  /* =========================
     INIT
  ========================= */

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();

    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id), Query.limit(1)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    await refresh(u.$id);
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
    await Promise.all([
      loadMatches(userId),
      loadActiveMatches(userId)
    ]);
  }

  /* =========================
     LOAD MATCHES
  ========================= */

  async function loadMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100)]
    );

    setMatches(
      res.documents.filter(
        m =>
          m.status === "waiting" &&
          !m.opponentId &&
          m.hostId !== userId
      )
    );
  }

  async function loadActiveMatches(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [Query.limit(100), Query.orderDesc("$createdAt")]
    );

    const mine = res.documents.filter(
      m => m.hostId === userId || m.opponentId === userId
    );

    setActiveMatches(mine);

    const map = {};

    await Promise.all(
      mine.map(async (m) => {
        if (!m.gameId) return;
        try {
          const g = await databases.getDocument(
            DATABASE_ID,
            GAME_COLLECTION,
            m.gameId
          );
          map[m.gameId] = g;
        } catch {}
      })
    );

    setGameMap(map);
  }

  /* =========================
     CREATE MATCH
  ========================= */

  async function createMatch() {
    const amount = Number(stake);
    if (!amount || amount < 50) return alert("Minimum ₦50");

    setCreating(true);

    try {
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
          hostZangiContact: wallet?.zangiContact || ""
        }
      );

      setStake("");
    } catch (err) {
      alert(err.message);
    }

    setCreating(false);
  }

  /* =========================
     JOIN MATCH
  ========================= */

  async function joinMatch(match) {
    if (loadingJoin) return;

    setLoadingJoin(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          opponentZangiContact: wallet?.zangiContact || ""
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

  /* =========================
     ZANGI CHAT
========================= */

  function openZangi(match) {
    const zangi = getOpponentZangi(match, user.$id);

    if (!zangi) {
      alert("Opponent Zangi not available");
      return;
    }

    navigator.clipboard.writeText(zangi);

    window.location.href =
      `zangi://chat?number=${encodeURIComponent(zangi)}`;
  }

  /* =========================
     UI
========================= */

  return (
    <div style={{ padding: 20, background: "#020617", color: "#fff" }}>
      <h1>🎮 Lobby</h1>

      <h2>🔥 Your Matches</h2>

      {activeMatches.map(m => {
        const game = gameMap[m.gameId];

        const turnLabel =
          game && game.status !== "finished"
            ? game.turn === user.$id
              ? "🟢 Your Turn"
              : "🔴 Opponent Turn"
            : "";

        const zangi = getOpponentZangi(m, user.$id);

        return (
          <div key={m.$id} style={{
            background: "#111827",
            padding: 12,
            margin: "10px 0",
            borderRadius: 12
          }}>
            <p>₦{m.stake}</p>
            <p>{m.status}</p>

            {/* ✅ TURN INDICATOR RESTORED */}
            {turnLabel && <p>{turnLabel}</p>}

            {m.status !== "finished" && zangi && (
              <button
                onClick={() => openZangi(m)}
                style={{
                  marginTop: 8,
                  background: "#2563eb",
                  color: "#fff",
                  padding: 10,
                  borderRadius: 10,
                  border: "none"
                }}
              >
                💬 Chat Opponent
              </button>
            )}

            {m.gameId && (
              <button
                onClick={() => goGame(m.gameId, m.stake)}
                style={{
                  marginTop: 8,
                  background: "#16a34a",
                  color: "#fff",
                  padding: 10,
                  borderRadius: 10,
                  border: "none"
                }}
              >
                ▶ Resume
              </button>
            )}
          </div>
        );
      })}

      <h2>🎯 Available Matches</h2>

      {matches.map(m => (
        <div key={m.$id} style={{
          background: "#111827",
          padding: 12,
          margin: "10px 0",
          borderRadius: 12
        }}>
          ₦{m.stake}

          <button
            onClick={() => joinMatch(m)}
            style={{
              marginLeft: 10,
              background: "gold",
              padding: 8,
              borderRadius: 8
            }}
          >
            Join
          </button>
        </div>
      ))}

      <input
        type="number"
        value={stake}
        onChange={e => setStake(e.target.value)}
        placeholder="Stake"
      />

      <button onClick={createMatch}>
        {creating ? "Creating..." : "Create Match"}
      </button>

      <button onClick={back}>Back</button>
    </div>
  );
}