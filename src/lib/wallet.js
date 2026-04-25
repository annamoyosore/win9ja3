import { databases, DATABASE_ID, WALLET_COLLECTION } from "./appwrite";
import { Query } from "appwrite";

export async function getWallet(userId) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    WALLET_COLLECTION,
    [Query.equal("userId", userId)]
  );

  return res.documents[0];
}

export async function updateBalance(walletId, balance) {
  return databases.updateDocument(
    DATABASE_ID,
    WALLET_COLLECTION,
    walletId,
    { balance }
  );
}