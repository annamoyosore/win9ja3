import { useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

const PROMO_COLLECTION = "promocodes";

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function hasActiveSession() {
    try {
      await account.get();
      return true;
    } catch {
      return false;
    }
  }

  async function clearSession() {
    try {
      await account.deleteSession("current");
    } catch {}
  }

  async function handle() {
    if (!email || !password || (!isLogin && !name)) {
      alert("Fill all fields");
      return;
    }

    try {
      setLoading(true);

      // =========================
      // LOGIN
      // =========================
      if (isLogin) {
        const alreadyLoggedIn = await hasActiveSession();

        if (!alreadyLoggedIn) {
          try {
            await account.createEmailSession(email, password);
          } catch (err) {
            if (err.message?.includes("session")) {
              await clearSession();
              await account.createEmailSession(email, password);
            } else {
              throw err;
            }
          }
        }

      } else {
        // =========================
        // REGISTER
        // =========================
        await clearSession();

        await account.create(
          ID.unique(),
          email,
          password,
          name
        );

        await account.createEmailSession(email, password);

        const currentUser = await account.get();

        // =========================
        // PROMO VALIDATION
        // =========================
        let bonus = 0;
        let promoValid = false;

        if (promoCode.trim()) {
          try {
            const res = await databases.listDocuments(
              DATABASE_ID,
              PROMO_COLLECTION,
              [Query.equal("code", promoCode.trim().toUpperCase())]
            );

            const promo = res.documents[0];

            if (
              promo &&
              promo.isActive &&
              (!promo.maxUses || promo.usedCount < promo.maxUses) &&
              (!promo.expiresAt || new Date(promo.expiresAt) > new Date())
            ) {
              promoValid = true;
              bonus = promo.reward || 0;

              await databases.updateDocument(
                DATABASE_ID,
                PROMO_COLLECTION,
                promo.$id,
                {
                  usedCount: (promo.usedCount || 0) + 1
                }
              );
            }

          } catch (err) {
            console.log("Promo error:", err.message);
          }

          if (!promoValid) {
            alert("Invalid promo code. Continuing without it.");
          } else {
            alert(`Promo applied! You received ${bonus} bonus 🎉`);
          }
        }

        // =========================
        // CREATE WALLET
        // =========================
        await databases.createDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ID.unique(),
          {
            userId: currentUser.$id,
            balance: 50 + bonus,
            locked: 0,
            promoUsed: promoValid,
            bonus: bonus
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

  // =========================
  // SUPPORT BUTTON HANDLER
  // =========================
  function openSupport() {
    const message = `Hello Win9ja Support, I need help`;
    const url = `https://wa.me/+18622726355?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h1 style={styles.logo}>🎮 Win9ja</h1>

        <h2>{isLogin ? "Login" : "Register"}</h2>

        {!isLogin && (
          <>
            <input
              style={styles.input}
              placeholder="Username"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Promo Code (optional)"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
            />
          </>
        )}

        <input
          style={styles.input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
        />

        {/* PASSWORD WITH EYE TOGGLE */}
        <div style={styles.passwordWrapper}>
          <input
            style={styles.passwordInput}
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span
            style={styles.eye}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "🙈" : "👁️"}
          </span>
        </div>

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

        <p
          style={styles.switch}
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Create account" : "Login instead"}
        </p>

        {/* ✅ SUPPORT BUTTON */}
        <button style={styles.supportBtn} onClick={openSupport}>
          💬 Contact Support
        </button>

        {/* ✅ LICENSE TEXT */}
        <p style={styles.license}>
          © {new Date().getFullYear()} Win9ja. All rights reserved. Licensed platform.
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
  passwordWrapper: {
    position: "relative",
    width: "100%",
    margin: "10px 0"
  },
  passwordInput: {
    width: "100%",
    padding: 10,
    paddingRight: 40,
    borderRadius: 6,
    border: "none"
  },
  eye: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    cursor: "pointer"
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
  },
  supportBtn: {
    marginTop: 15,
    width: "100%",
    padding: 10,
    background: "#25D366",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer"
  },
  license: {
    marginTop: 15,
    fontSize: 12,
    color: "#9ca3af"
  }
};