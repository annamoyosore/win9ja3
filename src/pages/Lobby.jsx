// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  MATCH_COLLECTION,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

import { lockFunds, unlockFunds } from "../lib/wallet";

const GAME_COLLECTION = "games";
const ADMIN_ID = "69ef9fe863a02a7490b4";

// =========================
// COMPONENT
// =========================
export default function Lobby({ goGame, back }) {

  const [available, setAvailable] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [running, setRunning] = useState([]);
  const [finished, setFinished] = useState([]);

  const [names, setNames] = useState({}); // ✅ cache names

  const [stake, setStake] = useState("");
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const u = await account.get();
    setUser(u);

    const w = await databases.listDocuments(
      DATABASE_ID,
      WALLET_COLLECTION,
      [Query.equal("userId", u.$id)]
    );

    if (w.documents.length) setWallet(w.documents[0]);

    refresh(u.$id);
  }

  // =========================
  // LOAD USER NAMES ONCE
  // =========================
  async function loadNames(userIds) {
    const map = {};

    for (let id of userIds) {
      if (names[id]) continue;

      try {
        const res = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("userId", id)]
        );

        map[id] = res.documents[0]?.name || "Player";
      } catch {
        map[id] = "Player";
      }
    }

    setNames(prev => ({ ...prev, ...map }));
  }

  // =========================
  // REFRESH
  // =========================
  async function refresh(userId) {
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION
    );

    const list = res.documents.filter(m => m.status !== "cancelled");

    const avail = [];
    const wait = [];
    const run = [];
    const fin = [];

    let ids = new Set();

    for (let m of list) {

      ids.add(m.hostId);
      if (m.opponentId) ids.add(m.opponentId);

      if (m.status === "finished") {
        fin.push(m);
      } else if (m.status === "waiting" && !m.opponentId) {
        if (m.hostId === userId) wait.push(m);
        else avail.push(m);
      } else if (m.status === "matched") {
        run.push(m);
      }
    }

    setAvailable(avail);
    setWaiting(wait);
    setRunning(run);
    setFinished(fin);

    loadNames([...ids]);
  }

  // =========================
  // CREATE MATCH
  // =========================
  async function createMatch() {
    const amount = Number(stake);

    if (!amount || amount < 50) return alert("Minimum ₦50");
    if ((wallet?.balance || 0) < amount)
      return alert("Insufficient balance");

    try {
      await lockFunds(user.$id, amount);

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
          adminPaid: false,
          createdAt: new Date().toISOString()
        }
      );

      setStake("");
      refresh(user.$id);

    } catch (err) {
      alert(err.message);
    }
  }

  // =========================
  // JOIN MATCH
  // =========================
  async function joinMatch(match) {
    if (loadingId) return;

    setLoadingId(match.$id);

    try {
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.adminPaid) throw new Error("Already joined");

      if ((wallet?.balance || 0) < fresh.stake)
        throw new Error("Insufficient balance");

      await lockFunds(user.$id, fresh.stake);

      const total = fresh.stake * 2;
      const adminCut = Math.floor(total * 0.1);

      // ✅ PAY ADMIN
      const adminWallet = await databases.listDocuments(
        DATABASE_ID,
        WALLET_COLLECTION,
        [Query.equal("userId", ADMIN_ID)]
      );

      if (adminWallet.documents.length) {
        const aw = adminWallet.documents[0];

        await databases.updateDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          aw.$id,
          {
            balance: Number(aw.balance || 0) + adminCut
          }
        );
      }

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        fresh.$id,
        {
          opponentId: user.$id,
          status: "matched",
          pot: total - adminCut,
          adminCut,
          adminPaid: true
        }
      );

      refresh(user.$id);

    } catch (err) {
      alert(err.message);
    }

    setLoadingId(null);
  }

  // =========================
  // CANCEL MATCH
  // =========================
  async function cancelMatch(match) {
    if (loadingId) return;

    setLoadingId(match.$id);

    try {
      await unlockFunds(user.$id, match.stake);

      await databases.updateDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id,
        { status: "cancelled" }
      );

      refresh(user.$id);

    } catch (err) {
      alert(err.message);
    }

    setLoadingId(null);
  }

  // =========================
  // CARD UI (SYNC NOW ✅)
// =========================
function Card({ m, type }) {
  const host = names[m.hostId] || "Player";
  const opp = m.opponentId ? names[m.opponentId] || "Player" : "Waiting...";

  const avatar = (n) => n.charAt(0).toUpperCase();

  return (
    <div style={styles.card}>
      <div>
        <p>{avatar(host)} {host}</p>
        <p>VS</p>
        <p>{avatar(opp)} {opp}</p>
        <p>₦{m.stake}</p>
      </div>

      {type === "available" && (
        <button style={styles.join} onClick={() => joinMatch(m)}>
          Join
        </button>
      )}

      {type === "waiting" && (
        <button style={styles.cancel} onClick={() => cancelMatch(m)}>
          Cancel
        </button>
      )}

      {type === "running" && (
        <button style={styles.play} onClick={() => goGame(m.gameId, m.stake)}>
          ▶ Play
        </button>
      )}

      {type === "finished" && (
        <button style={styles.finished} disabled>
          Finished
        </button>
      )}
    </div>
  );
}

  // =========================
  // UI
  // =========================
  return (
    <div style={styles.container}>
      <h1>🎮 Lobby</h1>

      <h2>🟢 Available</h2>
      {available.map(m => <Card key={m.$id} m={m} type="available" />)}

      <h2>🟡 Waiting</h2>
      {waiting.map(m => <Card key={m.$id} m={m} type="waiting" />)}

      <h2>🔵 Running</h2>
      {running.map(m => <Card key={m.$id} m={m} type="running" />)}

      <h2>✅ Finished</h2>
      {finished.map(m => <Card key={m.$id} m={m} type="finished" />)}

      <div style={styles.createBox}>
        <input
          value={stake}
          onChange={e => setStake(e.target.value)}
          placeholder="Stake ₦"
          style={styles.input}
        />
        <button onClick={createMatch} style={styles.create}>
          Create Match
        </button>
      </div>

      <button onClick={back} style={styles.back}>
        ← Back
      </button>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    padding: 20,
    background: "#020617",
    color: "#fff",
    minHeight: "100vh"
  },
  card: {
    background: "#111827",
    padding: 15,
    margin: "10px 0",
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between"
  },
  join: { background: "gold", padding: 8 },
  cancel: { background: "red", padding: 8, color: "#fff" },
  play: { background: "green", padding: 8, color: "#fff" },
  finished: { background: "#444", padding: 8, color: "#fff" },
  input: { width: "100%", padding: 10 },
  create: { width: "100%", padding: 10, background: "blue", color: "#fff" },
  back: { marginTop: 20, padding: 10 }
};