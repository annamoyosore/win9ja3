import { useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  ID,
  Query
} from "../lib/appwrite";

import InstallButton from "../components/InstallButton";

const PROMO_COLLECTION = "promocodes";
const WELCOME_COINS = 200;

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ================= GENERATE PROMO CODE =================
  function generatePromoCode(inputName) {
    const clean = inputName
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 5);

    const rand = Math.floor(1000 + Math.random() * 9000);

    return clean + rand;
  }

  // ================= CHECK SESSION =================
  async function hasActiveSession() {
    try {
      await account.get();
      return true;
    } catch {
      return false;
    }
  }

  // ================= CLEAR SESSION =================
  async function clearSession() {
    try {
      await account.deleteSession("current");
    } catch {}
  }

  // ================= NORMALIZE PHONE =================
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

  // ================= LOGIN / REGISTER =================
  async function handle() {
    if (
      !email.trim() ||
      !password ||
      (!isLogin && (!name.trim() || !phone.trim()))
    ) {
      alert("Fill all fields");
      return;
    }

    try {
      setLoading(true);

      // ==================================================
      // LOGIN
      // ==================================================
      if (isLogin) {
        const alreadyLoggedIn = await hasActiveSession();

        if (!alreadyLoggedIn) {
          try {
            await account.createEmailSession(
              email.trim(),
              password
            );
          } catch (err) {
            if (err.message?.toLowerCase().includes("session")) {
              await clearSession();

              await account.createEmailSession(
                email.trim(),
                password
              );
            } else {
              throw err;
            }
          }
        }
      }

      // ==================================================
      // REGISTER
      // ==================================================
      else {
        const cleanName = name.trim();
        const formattedPhone = normalizePhone(phone);

        if (!formattedPhone) {
          alert(
            "Enter a valid Nigerian phone number, e.g. 08012345678"
          );
          return;
        }

        // ================= UNIQUE NAME CHECK =================
        const existingName = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal("name", cleanName),
            Query.limit(1)
          ]
        );

        if (existingName.documents.length > 0) {
          alert(
            "This name is already taken. Please choose another."
          );
          return;
        }

        // ================= PHONE CHECK =================
        const existingPhone = await databases.listDocuments(
          DATABASE_ID,
          WALLET_COLLECTION,
          [
            Query.equal("phone", formattedPhone),
            Query.limit(1)
          ]
        );

        if (existingPhone.documents.length > 0) {
          alert("This phone number is already registered.");
          return;
        }

        // ================= CREATE ACCOUNT =================
        await clearSession();

        await account.create(
          ID.unique(),
          email.trim(),
          password,
          cleanName
        );

        // ================= LOGIN NEW ACCOUNT =================
        await account.createEmailSession(
          email.trim(),
          password
        );

        const currentUser = await account.get();

        // ==================================================
        // VALIDATE OPTIONAL PROMO CODE
        // ==================================================
        let promoUsed = false;
        let savedPromoCode = null;

        if (promoCode.trim()) {
          try {
            const code = promoCode.trim().toUpperCase();

            const result = await databases.listDocuments(
              DATABASE_ID,
              PROMO_COLLECTION,
              [
                Query.equal("code", code),
                Query.limit(1)
              ]
            );

            const promo = result.documents[0];

            if (
              promo &&
              promo.isActive &&
              (
                !promo.maxUses ||
                promo.usedCount < promo.maxUses
              )
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

              alert("Promo code accepted!");
            } else {
              alert(
                "Invalid or expired promo code. Continuing without it."
              );
            }
          } catch (err) {
            console.error("Promo validation error:", err);
          }
        }

        // ==================================================
        // CREATE USER'S OWN PROMO CODE
        // ==================================================
        let userPromo = generatePromoCode(cleanName);

        try {
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
          console.error(
            "Could not create user's promo code:",
            err
          );

          // Generate a different fallback code.
          userPromo = generatePromoCode(
            cleanName + Date.now().toString()
          ).slice(0, 20);
        }

        // ==================================================
        // CREATE WALLET WITH 200 WELCOME COINS
        // ==================================================
        await databases.createDocument(
          DATABASE_ID,
          WALLET_COLLECTION,
          ID.unique(),
          {
            userId: currentUser.$id,
            name: cleanName,
            phone: formattedPhone,

            // Welcome coins are stored here.
            coins: WELCOME_COINS,

            // Locked coins start at zero.
            locked: 0,

            promoUsed: promoUsed,
            promoCode: savedPromoCode,
            promoOwned: userPromo
          }
        );

        alert(
          `Welcome to Win9ja Life! You have received ${WELCOME_COINS} welcome coins.`
        );
      }

      // ================= CONTINUE TO APP =================
      if (typeof onLogin === "function") {
        await onLogin();
      }
    } catch (e) {
      console.error("Authentication error:", e);

      alert(
        e.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // ================= SUPPORT =================
  function openSupport() {
    const message = "Hello Win9ja Support, I need help.";

    const url =
      `https://wa.me/18622726355?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ================= UI =================
  return (
    <div style={styles.container}>
      <InstallButton />

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
              autoComplete="name"
            />

            <input
              style={styles.input}
              placeholder="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />

            <input
              style={styles.input}
              placeholder="Promo Code (optional)"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              autoCapitalize="characters"
            />

            <div style={styles.welcomeBox}>
              🎁 New users receive{" "}
              <strong>{WELCOME_COINS} Gold Coins</strong>
              {" "}when they register!
            </div>
          </>
        )}

        <input
          style={styles.input}
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <div style={styles.passwordWrapper}>
          <input
            style={styles.passwordInput}
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              isLogin ? "current-password" : "new-password"
            }
          />

          <span
            style={styles.eye}
            onClick={() => setShowPassword((prev) => !prev)}
            role="button"
            tabIndex={0}
            aria-label={
              showPassword ? "Hide password" : "Show password"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setShowPassword((prev) => !prev);
              }
            }}
          >
            {showPassword ? "🙈" : "👁️"}
          </span>
        </div>

        <button
          style={{
            ...styles.button,
            opacity: loading ? 0.7 : 1
          }}
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
          onClick={() => setIsLogin((prev) => !prev)}
        >
          {isLogin
            ? "Don't have an account? Create account"
            : "Already have an account? Login"}
        </p>

        <button
          style={styles.supportBtn}
          onClick={openSupport}
        >