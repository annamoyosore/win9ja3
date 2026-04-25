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
  const [name, setName] = useState(""); // ✅ NEW
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (!email || !password || (!isLogin && !name)) {
      alert("Fill all fields");
      return;
    }

    try {
      setLoading(true);

      if (isLogin) {
        // ✅ LOGIN
        await account.createEmailPasswordSession(email, password);
      } else {
        // ✅ REGISTER WITH NAME
        await account.create(
          ID.unique(),
          email,
          password,
          name // 👈 THIS SAVES USERNAME
        );

        // login after register
        await account.createEmailPasswordSession(email, password);

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
        {/* 🔥 SITE NAME */}
        <h1 style={styles.logo}>🎮 Win9ja</h1>

        <h2>{isLogin ? "Login" : "Register"}</h2>

        {/* ✅ SHOW NAME ONLY ON REGISTER */}
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
  logo: {
    marginBottom: 10,
    color: "gold"
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