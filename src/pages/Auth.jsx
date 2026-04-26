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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function ensureNoSession() {
    try {
      const sessions = await account.listSessions();
      for (const s of sessions.sessions) {
        await account.deleteSession(s.$id);
      }
    } catch {}
  }

  async function handle() {
    if (!email || !password || (!isLogin && !name)) {
      alert("Fill all fields");
      return;
    }

    try {
      setLoading(true);

      if (isLogin) {
        // ✅ LOGIN (MATCHES YOUR WORKING PROJECT)
        await account.createEmailSession(email, password);
      } else {
        // 🔥 CLEAN OLD SESSION
        await ensureNoSession();

        // ✅ REGISTER
        const user = await account.create(
          ID.unique(),
          email,
          password,
          name
        );

        // ✅ LOGIN AFTER REGISTER
        await account.createEmailSession(email, password);

        const currentUser = await account.get();

        // ✅ CREATE WALLET
        await databases.createDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ID.unique(),
          {
            userId: currentUser.$id,
            balance: 0
          }
        );
      }

      onLogin();

    } catch (e) {
      console.error(e);
      alert(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h1 style={styles.logo}>🎮 Win9ja</h1>

        <h2>{isLogin ? "Login" : "Register"}</h2>

        {!isLogin && (
          <input
            style={styles.input}
            placeholder="Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        <input
          style={styles.input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button style={styles.button} onClick={handle} disabled={loading}>
          {loading ? "Please wait..." : isLogin ? "Login" : "Register"}
        </button>

        <p style={styles.switch} onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Create account" : "Login instead"}
        </p>
      </div>
    </div>
  );
}

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
  logo: {
    color: "gold",
    marginBottom: 10
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
    fontWeight: "bold"
  },
  switch: {
    marginTop: 10,
    cursor: "pointer",
    color: "lightblue"
  }
};