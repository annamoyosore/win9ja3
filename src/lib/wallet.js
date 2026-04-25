// =========================
// IMPORTS
// =========================
import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  Query
} from "./appwrite";

// =========================
// GET WALLET
// =========================
export async function getWallet(userId) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    WALLET_COLLECTION,
    [Query.equal("userId", userId)]
  );

  if (!res.documents.length) {
    throw new Error("Wallet not found");
  }

  return res.documents[0];
}

// =========================
// LOCK FUNDS (VERY IMPORTANT)
// =========================
export async function lockFunds(userId, amount) {
  const wallet = await getWallet(userId);

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
// UNLOCK FUNDS (CANCEL MATCH)
// =========================
export async function unlockFunds(userId, amount) {
  const wallet = await getWallet(userId);

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: wallet.balance + amount,
      locked: Math.max(0, (wallet.locked || 0) - amount)
    }
  );
}

// =========================
// PAY WINNER
// =========================
export async function payWinner(userId, amount) {
  const wallet = await getWallet(userId);

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: wallet.balance + amount,
      locked: Math.max(0, (wallet.locked || 0) - amount)
    }
  );
}