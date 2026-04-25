import { Client, Account, Databases } from "appwrite";

const client = new Client()
  .setEndpoint("https://cloud.appwrite.io/v1")
  .setProject("YOUR_PROJECT_ID");

export const account = new Account(client);
export const databases = new Databases(client);

export const DATABASE_ID = "gameDB";
export const WALLET_COLLECTION = "wallets";
export const MATCH_COLLECTION = "matches";