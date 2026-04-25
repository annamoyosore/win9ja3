// =========================
// IMPORTS
// =========================
import {
  databases,
  DATABASE_ID,
  MATCH_COLLECTION
} from "./appwrite";

import { ID, Query } from "appwrite";
import { lockFunds } from "../utils/wallet"; // ✅ IMPORTANT

// =========================
// FIND OR CREATE MATCH
// =========================
export async function findMatch(userId, stake) {
  try {
    // =========================
    // FIND AVAILABLE MATCH
    // =========================
    const res = await databases.listDocuments(
      DATABASE_ID,
      MATCH_COLLECTION,
      [
        Query.equal("stake", stake),
        Query.equal("status", "waiting"),
        Query.limit(5) // reduce race issues
      ]
    );

    for (const match of res.documents) {
      // ❌ skip own match
      if (match.hostId === userId) continue;

      // =========================
      // RE-FETCH (ANTI-RACE)
      // =========================
      const fresh = await databases.getDocument(
        DATABASE_ID,
        MATCH_COLLECTION,
        match.$id
      );

      if (fresh.opponentId) continue;

      // =========================
      // LOCK FUNDS FIRST
      // =========================
      await lockFunds(userId, fresh.stake);

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
    }

    // =========================
    // NO MATCH → CREATE ONE
    // =========================
    await lockFunds(userId, stake);

    const newMatch = await databases.createDocument(
      DATABASE_ID,
      MATCH_COLLECTION,
      ID.unique(),
      {
        hostId: userId,
        opponentId: null, // ✅ FIXED
        stake,
        pot: stake,
        status: "waiting",
        winner: null,
        createdAt: new Date().toISOString()
      }
    );

    return newMatch.$id;

  } catch (err) {
    console.error("Matchmaking error:", err);
    throw new Error("Matchmaking failed");
  }
}