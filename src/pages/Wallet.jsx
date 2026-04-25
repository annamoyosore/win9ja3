// =========================
// IMPORTS
// =========================
import { databases, DATABASE_ID, WALLET_COLLECTION } from "./appwrite";
import { Query } from "appwrite";

// =========================
// GET WALLET
// =========================
export async function getWallet(userId) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    WALLET_COLLECTION,
    [Query.equal("userId", userId)]
  );

  return res.documents[0];
}

// =========================
// LOCK FUNDS
// =========================
export async function lockFunds(userId, amount) {
  const wallet = await getWallet(userId);

  if (!wallet) throw new Error("Wallet not found");

  if (wallet.balance < amount) {
    throw new Error("Insufficient balance");
  }

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: wallet.balance - amount,
      locked: (wallet.locked || 0) + amount
    }
  );
}

// =========================
// RELEASE FUNDS (REFUND)
// =========================
export async function releaseFunds(userId, amount) {
  const wallet = await getWallet(userId);

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: wallet.balance + amount,
      locked: (wallet.locked || 0) - amount
    }
  );
}

// =========================
// PAYOUT WINNER
// =========================
export async function payoutWinner(userId, amount) {
  const wallet = await getWallet(userId);

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: wallet.balance + amount,
      locked: (wallet.locked || 0) - amount / 2 // remove their own stake
    }
  );
}