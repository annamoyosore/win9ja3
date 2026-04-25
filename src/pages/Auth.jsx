import { useState } from "react";
import { account, databases, DATABASE_ID, WALLET_COLLECTION } from "../lib/appwrite";
import { ID } from "appwrite";

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handle() {
    try {
      if (isLogin) {
        await account.createEmailPasswordSession(email, password);
      } else {
        const user = await account.create(ID.unique(), email, password);

        // create wallet
        await databases.createDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ID.unique(),
          {
            userId: user.$id,
            balance: 0
          }
        );

        await account.createEmailPasswordSession(email, password);
      }

      onLogin();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <h2>{isLogin ? "Login" : "Register"}</h2>

      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />

      <button onClick={handle}>
        {isLogin ? "Login" : "Register"}
      </button>

      <p onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Create account" : "Login instead"}
      </p>
    </div>
  );
}