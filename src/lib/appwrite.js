import { Client, Account, Databases, ID, Query } from "appwrite";

const client = new Client()
.setEndpoint("https://nyc.cloud.appwrite.io/v1")
.setProject("69cb4e5c001651f6cfab");

export const account = new Account(client);
export const databases = new Databases(client);

export const DATABASE_ID = "69cb505d0015fbe8a669";

// Existing collections
export const WALLET_COLLECTION = "wallets";
export const MATCH_COLLECTION = "matches";
export const CASINO_COLLECTION = "casino_spins";
export const PROMO_COLLECTION = "promocodes";

// Payment collections
export const DEPOSIT_COLLECTION = "deposit_requests";
export const WITHDRAW_COLLECTION = "withdrawal_requests";
export const TRANSACTION_COLLECTION = "transactions";

// Other existing collections
export const SNAKE_LOBBY_COLLECTION = "snakelobby";
export const SNAKE_GAME_COLLECTION = "snakegame";

// New settings collection in the existing database
export const APP_SETTINGS_COLLECTION = "app_settings";

export { client, ID, Query };