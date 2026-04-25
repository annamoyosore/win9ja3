// =========================
// IMPORTS
// =========================
import {
  databases,
  DATABASE_ID,
  MATCH_COLLECTION
} from "./appwrite";

import { ID, Query } from "appwrite";
import { lockFunds, releaseFunds } from "./wallet"; // ✅ FIXED PATH + NAME

// =========================
// FIND OR CREATE MATCH
// =========================
export async function findMatch(userId, stake) {
  let locked = false;

  try {
    // =========================
    // VALIDATION
    // =========================
    if (!userId) throw new Error("User not authenticated");

    stake = Number(stake);

    if (!stake || stake <= 0) {
      throw new Error("Invalid stake amount");
    }

    // =========================
    // FIND AVAILABLE MATCHES
    // =========================
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("stake", stake),
        Query.equal("status", "waiting"),
        Query.limit(5)
      ]
    );

    // =========================
    // TRY JOIN EXISTING MATCH
    // =========================
    for (const match of res.documents) {
      try {
        // ❌ skip own match
        if (match.hostId === userId) continue;

        // 🔄 RE-FETCH (ANTI-RACE)
        const fresh = await databases.getDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          match.$id
        );

        // ❌ already taken
        if (fresh.opponentId) continue;

        // =========================
        // LOCK FUNDS
        // =========================
        await lockFunds(userId, fresh.stake);
        locked = true;

        // =========================
        // JOIN MATCH
        // =========================
        await databases.updateDocument(
          DATABASE_ID,
          MATCH_COLLECTION,
          fresh.$id,
          {
            opponentId: userId,
            status: "matched",
            pot: fresh.stake * 2
          }
        );

        return fresh.$id;

      } catch (joinErr) {
        console.warn("Join failed:", joinErr);

        // 🔁 rollback lock if failed
        if (locked) {
          await releaseFunds(userId, stake);
          locked = false;
        }

        continue;
      }
    }

    // =========================
    // CREATE NEW MATCH
    // =========================
    await lockFunds(userId, stake);
    locked = true;

    try {
      const newMatch = await databases.createDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        ID.unique(),
        {
          hostId: userId,
          opponentId: null,
          stake,
          pot: stake,
          status: "waiting",
          winner: null,
          createdAt: new Date().toISOString()
        }
      );

      return newMatch.$id;

    } catch (createErr) {
      console.error("Create failed:", createErr);

      // 🔁 rollback lock
      if (locked) {
        await releaseFunds(userId, stake);
      }

      throw createErr;
    }

  } catch (err) {
    console.error("Matchmaking error:", err);
    throw new Error(err.message || "Matchmaking failed");
  }
}