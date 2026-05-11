import { useEffect, useState, useRef } from "react";
import {
  account,
  databases,
  DATABASE_ID
} from "../lib/appwrite";

import boardImg from "./board.png";

const COLLECTION = "snakegame";
const SIZE = 100;

// ================= HELPERS =================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function applyEffects(pos) {
  const snakes = {
    50: 5,
    43: 17,
    56: 8,
    68: 15,
    84: 58,
    87: 49,
    98: 40,
  };

  const ladders = {
    2: 23,
    6: 45,
    20: 59,
    52: 72,
    57: 96,
    71: 92,
  };

  if (snakes[pos]) return snakes[pos];
  if (ladders[pos]) return ladders[pos];
  return pos;
}

function getCoords(pos) {
  const index = pos - 1;
  const row = Math.floor(index / 10);
  let col = index % 10;

  if (row % 2 === 1) col = 9 - col;

  return {
    left: `${col * 10 + 5}%`,
    top: `${(9 - row) * 10 + 5}%`,
  };
}

// ================= MAIN =================
export default function SnakeGame({ gameId }) {

  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);

  const [positions, setPositions] = useState({ A: 1, B: 1 });
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);

  const lock = useRef(false);

  // ================= LOAD =================
  useEffect(() => {
    async function init() {
      const u = await account.get();
      setUser(u);

      const g = await databases.getDocument(
        DATABASE_ID,
        COLLECTION,
        gameId
      );

      setGame(g);

      setPositions(
        g.positions ? JSON.parse(g.positions) : { A: 1, B: 1 }
      );
    }

    init();
  }, [gameId]);

  // ================= REALTIME =================
  useEffect(() => {
    if (!gameId) return;

    const unsub = databases.client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTION}.documents.${gameId}`,
      (res) => {
        const g = res.payload;

        setGame(g);

        setPositions(
          g.positions ? JSON.parse(g.positions) : { A: 1, B: 1 }
        );
      }
    );

    return () => unsub();
  }, [gameId]);

  // ================= PLAYER SIDE =================
  function getSide(g) {
    if (!user || !g) return null;
    return user.$id === g.hostId ? "A" : "B";
  }

  const isMyTurn = game?.turn === user?.$id;

  // ================= PLAY =================
  async function playTurn() {

    if (!game || !user || rolling || lock.current) return;
    if (!isMyTurn) return;

    lock.current = true;
    setRolling(true);

    try {

      const fresh = await databases.getDocument(
        DATABASE_ID,
        COLLECTION,
        gameId
      );

      const side = getSide(fresh);

      const posData = JSON.parse(fresh.positions || '{"A":1,"B":1}');

      // 🎲 dice animation
      for (let i = 0; i < 6; i++) {
        setDice(Math.floor(Math.random() * 6) + 1);
        await sleep(80);
      }

      const roll = rollDice();
      setDice(roll);

      let pos = posData[side] || 1;
      let target = Math.min(pos + roll, SIZE);

      // movement animation
      while (pos < target) {
        await sleep(120);
        pos++;
        setPositions(p => ({ ...p, [side]: pos }));
      }

      const final = applyEffects(pos);

      setPositions(p => ({ ...p, [side]: final }));

      const winner = final >= SIZE ? user.$id : null;

      const nextTurn =
        fresh.turn === fresh.hostId
          ? fresh.opponentId
          : fresh.hostId;

      // ================= HISTORY (STRING ONLY) =================
      let history = fresh.history || "";

      const entry = `🎲 ${side} rolled ${roll} → ${final}`;

      history = history
        ? history + "||" + entry
        : entry;

      // keep last 10 entries
      const parts = history.split("||").slice(-10);

      const finalHistory = parts.join("||");

      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION,
        gameId,
        {
          positions: JSON.stringify({
            ...posData,
            [side]: final
          }),
          turn: winner ? null : nextTurn,
          status: winner ? "finished" : "running",
          winner: winner || "",
          history: finalHistory
        }
      );

    } catch (err) {
      console.error(err);
    } finally {
      setRolling(false);
      lock.current = false;
    }
  }

  // ================= UI =================
  if (!game) return <div style={{ color: "#fff" }}>Loading...</div>;

  const side = getSide(game);

  const myPos = positions[side] || 1;
  const opp = side === "A" ? "B" : "A";
  const oppPos = positions[opp] || 1;

  const historyList = (game.history || "")
    .split("||")
    .filter(Boolean);

  return (
    <div style={{ textAlign: "center", background: "#0f172a", color: "#fff", minHeight: "100vh", padding: 20 }}>

      <h2>🐍 Snake Game</h2>

      <div>🎲 Dice: {dice}</div>

      <div>
        Turn: {isMyTurn ? "🟢 YOUR TURN" : "🔵 OPPONENT TURN"}
      </div>

      <div style={{ position: "relative", width: 360, height: 360, margin: "20px auto" }}>
        <img src={boardImg} style={{ width: "100%" }} />

        <div style={{ position: "absolute", ...getCoords(myPos), width: 25, height: 25, borderRadius: "50%", background: "red" }} />

        <div style={{ position: "absolute", ...getCoords(oppPos), width: 25, height: 25, borderRadius: "50%", background: "blue" }} />
      </div>

      <button
        onClick={playTurn}
        disabled={!isMyTurn || rolling}
        style={{
          padding: 12,
          background: isMyTurn ? "gold" : "gray",
          borderRadius: 8,
          border: "none"
        }}
      >
        {rolling ? "Rolling..." : "🎲 Roll Dice"}
      </button>

      {/* HISTORY */}
      <div style={{ marginTop: 10, fontSize: 13 }}>
        {historyList.map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>

    </div>
  );
}