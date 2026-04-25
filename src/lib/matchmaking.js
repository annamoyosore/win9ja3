import { databases, DATABASE_ID, MATCH_COLLECTION } from "./appwrite";
import { ID, Query } from "appwrite";

export async function findMatch(userId, stake) {
  const res = await databases.listDocuments(
    DATABASE_ID,
    MATCH_COLLECTION,
    [
      Query.equal("stake", stake),
      Query.equal("status", "waiting")
    ]
  );

  if (res.documents.length > 0) {
    const match = res.documents[0];

    await databases.updateDocument(
      DATABASE_ID,
      MATCH_COLLECTION,
      match.$id,
      {
        status: "matched",
        opponentId: userId
      }
    );

    return match.$id;
  }

  const newMatch = await databases.createDocument(
    DATABASE_ID,
    MATCH_COLLECTION,
    ID.unique(),
    {
      hostId: userId,
      opponentId: "",
      stake,
      status: "waiting"
    }
  );

  return newMatch.$id;
}