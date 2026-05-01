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
// DATABASE ID
// =========================
export const DATABASE_ID = "69cb505d0015fbe8a669";

// =========================
// COLLECTION IDS
// =========================
// ⚠️ MUST match EXACT IDs in Appwrite dashboard

export const COLLECTIONS = {
WALLET: "wallets",
MATCH: "matches",
GAME: "games",
CASINO: "casino_spins" // ✅ ADDED
};

// =========================
// OPTIONAL DIRECT EXPORTS (for convenience)
// =========================
export const WALLET_COLLECTION = COLLECTIONS.WALLET;
export const MATCH_COLLECTION = COLLECTIONS.MATCH;
export const GAME_COLLECTION = COLLECTIONS.GAME;
export const CASINO_COLLECTION = COLLECTIONS.CASINO; // ✅ IMPORTANT

// =========================
// EXPORT HELPERS
// =========================
export { client, ID, Query };