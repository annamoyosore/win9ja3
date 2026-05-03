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
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function generatePromoCode(name) {
    const clean = name.replace(/\s+/g, "").toUpperCase().slice(0, 5);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return clean + rand;
  }

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

  function normalizePhone(input) {
    let p = input.replace(/\D/g, "");

    if (p.startsWith("0")) {
      p = "234" + p.slice(1);
    }

    if (!p.startsWith("234") || p.length !== 13) {
      return null;
    }

    return p;
  }

  async function handle() {
    if (!email || !password || (!isLogin && (!name || !phone))) {
      alert("Fill all fields");
      return;
    }

    try {
      setLoading(true);

      // ================= LOGIN =================
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
        // ================= REGISTER =================

        const formattedPhone = normalizePhone(phone);

        if (!formattedPhone) {
          alert("Enter valid phone number");
          setLoading(false);
          return;
        }

        // Check duplicate phone
        const existing = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [Query.equal("phone", formattedPhone)]
        );

        if (existing.documents.length > 0) {
          alert("This phone number is already registered");
          setLoading(false);
          return;
        }

        await clearSession();

        await account.create(
          ID.unique(),
          email,
          password,
          name.trim()
        );

        await account.createEmailSession(email, password);

        const currentUser = await account.get();

        // ================= PROMO USED =================
        let promoUsed = false;
        let savedPromoCode = null;

        if (promoCode.trim()) {
          try {
            const code = promoCode.trim().toUpperCase();

            const res = await databases.listDocuments(
              DATABASE_ID,
              PROMO_COLLECTION,
              [Query.equal("code", code)]
            );

            const promo = res.documents[0];

            if (
              promo &&
              promo.isActive &&
              (!promo.maxUses || promo.usedCount < promo.maxUses)
            ) {
              promoUsed = true;
              savedPromoCode = code;

              await databases.updateDocument(
                DATABASE_ID,
                PROMO_COLLECTION,
                promo.$id,
                {
                  usedCount: (promo.usedCount || 0) + 1
                }
              );

              alert("Promo code accepted ✅");

            } else {
              alert("Invalid promo code. Continuing without it.");
            }

          } catch (err) {
            console.log("Promo error:", err.message);
          }
        }

        // ================= CREATE USER PROMO =================
        let userPromo = null;

        try {
          userPromo = generatePromoCode(name);

          await databases.createDocument(
            DATABASE_ID,
            PROMO_COLLECTION,
            ID.unique(),
            {
              code: userPromo,
              ownerId: currentUser.$id,
              usedCount: 0,
              isActive: true
            }
          );

        } catch (err) {
          console.log("Promo create failed, retrying...");
          userPromo = generatePromoCode(name + Date.now());
        }

        // ================= WALLET =================
        await databases.createDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ID.unique(),
          {
            userId: currentUser.$id,
            name: name.trim(),
            phone: formattedPhone,
            balance: 500,
            locked: 0,
            promoUsed: promoUsed,
            promoCode: savedPromoCode,
            promoOwned: userPromo // ✅ user's own code
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

  function openSupport() {
    const message = `Hello Win9ja Support, I need help`;
    const url = `https://wa.me/18622726355?text=${encodeURIComponent(message)}`;
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
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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

        <div style={styles.passwordWrapper}>
          <input
            style={styles.passwordInput}
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span style={styles.eye} onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? "🙈" : "👁️"}
          </span>
        </div>

        <button style={styles.button} onClick={handle} disabled={loading}>
          {loading ? "Please wait..." : isLogin ? "Login" : "Register"}
        </button>

        <p style={styles.switch} onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Create account" : "Login instead"}
        </p>

        <button style={styles.supportBtn} onClick={openSupport}>
          💬 Contact Support
        </button>

        <p style={styles.license}>
          © {new Date().getFullYear()} Win9ja. All rights reserved.
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
  logo: { color: "gold" },
  input: {
    width: "100%",
    padding: 10,
    margin: "10px 0",
    borderRadius: 6,
    border: "none"
  },
  passwordWrapper: { position: "relative" },
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
    borderRadius: 8
  },
  switch: { marginTop: 10, cursor: "pointer", color: "lightblue" },
  supportBtn: {
    marginTop: 15,
    width: "100%",
    padding: 10,
    background: "#25D366",
    border: "none",
    borderRadius: 8,
    color: "#fff"
  },
  license: { marginTop: 10, fontSize: 12 }
};