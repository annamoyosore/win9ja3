import { useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  ID
} from "../lib/appwrite";

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (!email || !password) {
      alert("Enter email and password");
      return;
    }

    try {
      setLoading(true);

      if (isLogin) {
        // ✅ LOGIN (compatible with all SDK versions)
        await account.createSession(email, password);
      } else {
        // ✅ REGISTER
        await account.create(ID.unique(), email, password);

        // ✅ LOGIN AFTER REGISTER
        await account.createSession(email, password);

        const user = await account.get();

        // ✅ CREATE WALLET
        await databases.createDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ID.unique(),
          {
            userId: user.$id,
            balance: 0
          }
        );
      }

      onLogin();
    } catch (e) {
      console.error("Auth error:", e);
      alert(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h2>{isLogin ? "Login" : "Register"}</h2>

        <input
          style={styles.input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          style={styles.button}
          onClick={handle}
          disabled={loading}
        >
          {loading
            ? "Please wait..."
            : isLogin
            ? "Login"
            : "Register"}
        </button>

        <p style={styles.switch} onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Create account" : "Login instead"}
        </p>
      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a",
    color: "#fff"
  },
  box: {
    padding: 20,
    background: "#111827",
    borderRadius: 10,
    width: 300,
    textAlign: "center"
  },
  input: {
    width: "100%",
    padding: 10,
    margin: "10px 0",
    borderRadius: 6,
    border: "none"
  },
  button: {
    width: "100%",
    padding: 12,
    background: "gold",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer"
  },
  switch: {
    marginTop: 10,
    cursor: "pointer",
    color: "lightblue"
  }
};