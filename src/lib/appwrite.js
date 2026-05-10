import { Client, Account, Databases, ID, Query } from "appwrite";

// =========================
// CLIENT SETUP
// =========================
const client = new Client();

client
  .setEndpoint("https://nyc.cloud.appwrite.io/v1")
  .setProject("69cb4e5c001651f6cfab");

// =========================
// SERVICES
// =========================
export const account = new Account(client);
export const databases = new Databases(client);

// =========================
// DATABASE ID
// =========================
export const DATABASE_ID = "69cb505d0015fbe8a669";

// =========================
// COLLECTIONS (CLEAN ARCHITECTURE)
// =========================
export const WALLET_COLLECTION = "wallets";
export const MATCH_COLLECTION = "matches";          // WHOT GAME
export const CASINO_COLLECTION = "casino_spins";    // CASINO
export const PROMO_COLLECTION = "promocodes";

// 🐍 SNAKE GAME SYSTEM
export const SNAKE_LOBBY_COLLECTION = "snakelobby";
export const SNAKE_GAME_COLLECTION = "snakegame";

// =========================
// EXPORT HELPERS
// =========================
export { client, ID, Query };