import { Client, Account, Databases, ID, Query } from "appwrite";

// =========================
// CLIENT SETUP
// =========================
const client = new Client();

client
.setEndpoint("https://nyc.cloud.appwrite.io/v1") // your region endpoint
.setProject("69cb4e5c001651f6cfab"); // your project ID

// =========================
// SERVICES
// =========================
export const account = new Account(client);
export const databases = new Databases(client);

// =========================
// DATABASE + COLLECTION IDS
// =========================
export const DATABASE_ID = "69cb505d0015fbe8a669";

// ⚠️ MUST match EXACT IDs in Appwrite dashboard
export const WALLET_COLLECTION = "wallets";
export const MATCH_COLLECTION = "matches";
export const GAME_COLLECTION = "games";
export const CASINO_COLLECTION = "casino_spins";

// =========================
// EXPORT HELPERS
// =========================
export { client, ID, Query };