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
  const [matches, setMatches] = useState([]);  
  const [activeMatches, setActiveMatches] = useState([]);  
  const [gameMap, setGameMap] = useState({});  
  const [stake, setStake] = useState("");  
  const [user, setUser] = useState(null);  
  const [wallet, setWallet] = useState(null);  
  const [loadingId, setLoadingId] = useState(null);  

  useEffect(() => { init(); }, []);  

  async function init() {  
    const u = await account.get();  
    setUser(u);  

    const w = await databases.listDocuments(  
      DATABASE_ID,  
      WALLET_COLLECTION,  
      [Query.equal("userId", u.$id), Query.limit(1)]  
    );  

    if (w.documents.length) setWallet(w.documents[0]);  

    refresh(u.$id);  
  }  

  // =========================  
  // REALTIME  
  // =========================  
  useEffect(() => {  
    if (!user) return;  

    const unsubMatch = databases.client.subscribe(  
      `databases.${DATABASE_ID}.collections.${MATCH_COLLECTION}.documents`,  
      () => refresh(user.$id)  
    );  

    const unsubGame = databases.client.subscribe(  
      `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents`,  
      () => refresh(user.$id)  
    );  

    return () => {  
      unsubMatch();  
      unsubGame();  
    };  
  }, [user]);  

  async function refresh(userId) {  
    await Promise.all([  
      loadMatches(userId),  
      loadActiveMatches(userId)  
    ]);  
  }  

  // =========================  
  // AVAILABLE MATCHES  
  // =========================  
  async function loadMatches(userId) {  
    const res = await databases.listDocuments(  
      DATABASE_ID,  
      MATCH_COLLECTION,  
      [Query.limit(100)]  
    );  

    setMatches(  
      res.documents.filter(  
        m => m.status === "waiting" &&  
        !m.opponentId &&  
        m.hostId !== userId  
      )  
    );  
  }  

  // =========================  
  // ACTIVE MATCHES  
  // =========================  
  async function loadActiveMatches(userId) {  
    const res = await databases.listDocuments(  
      DATABASE_ID,  
      MATCH_COLLECTION,  
      [Query.limit(100), Query.orderDesc("$createdAt")]  
    );  

    const mine = res.documents.filter(  
      m =>  
        (m.hostId === userId || m.opponentId === userId) &&  
        m.status !== "cancelled"  
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

  // =========================  
  // CANCEL MATCH  
  // =========================  
  async function cancelMatch(match) {  
    try {  
      await databases.updateDocument(  
        DATABASE_ID,  
        MATCH_COLLECTION,  
        match.$id,  
        { status: "cancelled" }  
      );  

      await unlockFunds(user.$id, match.stake);  
      refresh(user.$id);  
    } catch {  
      alert("Cancel failed");  
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

      if (fresh.status !== "waiting" || fresh.opponentId) {  
        throw new Error("Match already taken");  
      }  

      if ((wallet?.balance || 0) < fresh.stake) {  
        throw new Error("Insufficient balance");  
      }  

      await lockFunds(user.$id, fresh.stake);  

      const totalPot = fresh.stake * 2;  
      const adminCut = Math.floor(totalPot * 0.1);  
      const gamePot = totalPot - adminCut;  

      // ADMIN CUT  
      const adminRes = await databases.listDocuments(  
        DATABASE_ID,  
        WALLET_COLLECTION,  
        [Query.equal("userId", ADMIN_ID), Query.limit(1)]  
      );  

      if (adminRes.documents.length) {  
        const adminWallet = adminRes.documents[0];  

        await databases.updateDocument(  
          DATABASE_ID,  
          WALLET_COLLECTION,  
          adminWallet.$id,  
          { balance: (adminWallet.balance || 0) + adminCut }  
        );  
      }  

      // UPDATE MATCH  
      const updated = await databases.updateDocument(  
        DATABASE_ID,  
        MATCH_COLLECTION,  
        fresh.$id,  
        {  
          opponentId: user.$id,  
          status: "matched",  
          pot: 0  
        }  
      );  

      // CREATE GAME  
      const game = await databases.createDocument(  
        DATABASE_ID,  
        GAME_COLLECTION,  
        ID.unique(),  
        {  
          matchId: updated.$id,  
          players: `${updated.hostId},${user.$id}`,  
          pot: gamePot,  
          status: "running",  
          turn: updated.hostId  
        }  
      );  

      await databases.updateDocument(  
        DATABASE_ID,  
        MATCH_COLLECTION,  
        updated.$id,  
        { gameId: game.$id }  
      );  

      goGame(game.$id);  

    } catch (err) {  
      alert(err.message);  
    }  

    setLoadingId(null);  
  }  

  // =========================  
  // CREATE MATCH  
  // =========================  
  async function createMatch() {  
    const amount = Number(stake);  

    if (!amount || amount < 50) return alert("Minimum ₦50");  

    if ((wallet?.balance || 0) < amount) {  
      return alert("Insufficient balance");  
    }  

    await lockFunds(user.$id, amount);  

    await databases.createDocument(  
      DATABASE_ID,  
      MATCH_COLLECTION,  
      ID.unique(),  
      {  
        hostId: user.$id,  
        opponentId: null,  
        stake: amount,  
        status: "waiting"  
      }  
    );  

    setStake("");  
  }  

  // =========================  
  // TURN LABEL  
  // =========================  
  function getTurnLabel(game) {  
    if (!game) return "⏳ Loading...";  
    if (game.status === "finished") return "✅ Finished";  
    if (!game.turn) return "⚠️ No turn data";  

    return game.turn === user?.$id  
      ? "🟢 Your Turn"  
      : "🔴 Opponent Turn";  
  }  

  // =========================  
  // UI  
  // =========================  
  return (  
    <div style={styles.container}>  
      <h1>🎮 Game Lobby</h1>  

      <h2>🔥 Your Matches</h2>  

      {activeMatches.map(m => {  
        const game = gameMap[m.gameId];  

        return (  
          <div key={m.$id} style={styles.card}>  
            <div>  
              <p>₦{m.stake}</p>  
              <p>{m.status}</p>  
              <p>{getTurnLabel(game)}</p>  
            </div>  

            {m.status === "finished" ? (  
              <button style={styles.finished} disabled>  
                ✅ Finished  
              </button>  

            ) : m.status === "waiting" && m.hostId === user?.$id ? (  

              <button style={styles.cancel} onClick={() => cancelMatch(m)}>  
                ❌ Cancel  
              </button>  

            ) : m.gameId ? (  

              <button style={styles.play} onClick={() => goGame(m.gameId)}>  
                ▶ Resume  
              </button>  

            ) : null}  
          </div>  
        );  
      })}  

      <h2>🎯 Available</h2>  

      {matches.map(m => (  
        <div key={m.$id} style={styles.card}>  
          <span>₦{m.stake}</span>  
          <button style={styles.join} onClick={() => joinMatch(m)}>  
            Join  
          </button>  
        </div>  
      ))}  

      <div style={styles.box}>  
        <input  
          value={stake}  
          onChange={e => setStake(e.target.value)}  
          placeholder="Stake ₦"  
          style={styles.input}  
        />  

        <button style={styles.create} onClick={createMatch}>  
          Create Match  
        </button>  
      </div>  

      <button style={styles.back} onClick={back}>  
        ← Back  
      </button>  
    </div>  
  );  
}  

// =========================  
// STYLES  
// =========================  
const styles = {  
  container: { padding: 20, background: "#020617", color: "#fff" },  
  card: {  
    background: "#111827",  
    padding: 15,  
    margin: "10px 0",  
    display: "flex",  
    justifyContent: "space-between"  
  },  
  join: { background: "gold", padding: 8 },  
  play: { background: "green", color: "#fff", padding: 8 },  
  cancel: { background: "red", color: "#fff", padding: 8 },  
  finished: { background: "#16a34a", color: "#fff", padding: 8, opacity: 0.7 },  
  create: { background: "blue", color: "#fff", padding: 10, width: "100%" },  
  input: { width: "100%", padding: 10 },  
  box: { marginTop: 10 },  
  back: { marginTop: 20 }  
};