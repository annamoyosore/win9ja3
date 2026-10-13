import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  Query
} from "./appwrite";

/**
 * Get a user's wallet.
 */
export async function getWallet(userId) {
  const response = await databases.listDocuments(
    DATABASE_ID,
    WALLET_COLLECTION,
    [
      Query.equal("userId", userId),
      Query.limit(1)
    ]
  );

  if (response.documents.length === 0) {
    throw new Error("Wallet not found.");
  }

  return response.documents[0];
}

/**
 * Lock game funds when a user enters a game.
 * This function changes balance and locked only.
 * It does not change the user's coin balance.
 */
export async function lockFunds(userId, amount) {
  amount = Number(amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid amount.");
  }

  const wallet = await getWallet(userId);

  const balance = Number(wallet.balance || 0);
  const locked = Number(wallet.locked || 0);

  if (balance < amount) {
    throw new Error("Insufficient game balance.");
  }

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: balance - amount,
      locked: locked + amount
    }
  );
}

/**
 * Return locked game funds to the user's game balance.
 */
export async function unlockFunds(userId, amount) {
  amount = Number(amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid amount.");
  }

  const wallet = await getWallet(userId);

  const balance = Number(wallet.balance || 0);
  const locked = Number(wallet.locked || 0);

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: balance + amount,
      locked: Math.max(0, locked - amount)
    }
  );
}

/**
 * Credit game winnings.
 * This preserves your existing wallet logic.
 */
export async function payWinner(userId, amount) {
  amount = Number(amount);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter a valid winning amount.");
  }

  const wallet = await getWallet(userId);

  const balance = Number(wallet.balance || 0);
  const locked = Number(wallet.locked || 0);

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    {
      balance: balance + amount,
      locked: Math.max(0, locked - amount / 2)
    }
  );
}