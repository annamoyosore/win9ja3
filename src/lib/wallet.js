import {
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  TRANSACTION_COLLECTION,
  Query,
  ID
} from "./appwrite";

/**
 * WIN9JA LIFE WALLET
 *
 * coins  = currency for gameplay
 * balance = legacy game balance, retained during migration
 *
 * IMPORTANT:
 * These client-side functions are a migration step.
 * Production game stakes and payouts should be handled
 * through trusted server-side functions to prevent race conditions.
 */

// =====================================
// GET USER WALLET
// =====================================
export async function getWallet(userId) {
  if (!userId) {
    throw new Error("A user ID is required.");
  }

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

// =====================================
// GET COIN BALANCE
// =====================================
export async function getCoinBalance(userId) {
  const wallet = await getWallet(userId);
  return Number(wallet.coins || 0);
}

// =====================================
// UPDATE COINS
// =====================================
async function updateCoins(userId, newCoins) {
  if (!Number.isSafeInteger(newCoins) || newCoins < 0) {
    throw new Error("Invalid coin balance.");
  }

  const wallet = await getWallet(userId);

  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    wallet.$id,
    { coins: newCoins }
  );
}

// =====================================
// SPEND COINS TO ENTER A GAME
// =====================================
export async function spendCoins(userId, amount) {
  amount = Number(amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Enter a valid whole number of coins.");
  }

  const wallet = await getWallet(userId);
  const coins = Number(wallet.coins || 0);

  if (coins < amount) {
    throw new Error("Insufficient coins. Please purchase more coins.");
  }

  return updateCoins(userId, coins - amount);
}

// =====================================
// REFUND COINS
// Use when a game is cancelled or cannot start.
// =====================================
export async function refundCoins(userId, amount) {
  amount = Number(amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Enter a valid whole number of coins.");
  }

  const wallet = await getWallet(userId);
  const coins = Number(wallet.coins || 0);

  return updateCoins(userId, coins + amount);
}

// =====================================
// AWARD COINS TO A WINNER
// =====================================
export async function awardCoins(userId, amount) {
  amount = Number(amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Enter a valid whole number of winning coins.");
  }

  const wallet = await getWallet(userId);
  const coins = Number(wallet.coins || 0);

  return updateCoins(userId, coins + amount);
}

// =====================================
// LEGACY FUNCTIONS
// Keep these until all games are converted.
// They still use balance and locked.
// =====================================
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