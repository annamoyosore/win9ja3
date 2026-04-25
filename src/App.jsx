import { useEffect, useState } from "react";
import { account } from "./lib/appwrite";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Match from "./pages/Match";
import WhotGame from "./WhotGame";

export default function App() {
  const [page, setPage] = useState("loading");
  const [matchId, setMatchId] = useState(null);
  const [stake, setStake] = useState(0);

  // =========================
  // SESSION CHECK
  // =========================
  useEffect(() => {
    account.get()
      .then(() => setPage("dashboard"))
      .catch(() => setPage("auth"));
  }, []);

  // =========================
  // LOGOUT
  // =========================
  async function logout() {
    try {
      await account.deleteSession("current");
    } catch (e) {
      console.warn("Logout error:", e);
    }

    // ✅ reset state
    setMatchId(null);
    setStake(0);
    setPage("auth");
  }

  // =========================
  // ROUTES
  // =========================

  // 🔄 Loading
  if (page === "loading") {
    return (
      <div style={styles.loading}>
        <h2>🎮 Win9ja</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // 🔐 Auth
  if (page === "auth") {
    return <Auth onLogin={() => setPage("dashboard")} />;
  }

  // 🏠 Dashboard
  if (page === "dashboard") {
    return (
      <Dashboard
        goMatch={(id, s) => {
          setMatchId(id);
          setStake(s);
          setPage("match");
        }}
        goWallet={() => setPage("wallet")}
        logout={logout}
      />
    );
  }

  // 💳 Wallet
  if (page === "wallet") {
    return <Wallet back={() => setPage("dashboard")} />;
  }

  // 🎯 Match
  if (page === "match") {
    // ✅ safety check
    if (!matchId) {
      setPage("dashboard");
      return null;
    }

    return (
      <Match
        matchId={matchId}
        stake={stake} // ✅ FIXED
        startGame={() => setPage("game")}
        cancel={() => {
          setMatchId(null); // ✅ reset
          setStake(0);      // ✅ reset
          setPage("dashboard");
        }}
      />
    );
  }

  // 🎮 Game
  if (page === "game") {
    return (
      <WhotGame
        stake={stake}
        goHome={() => {
          setMatchId(null); // ✅ reset
          setStake(0);      // ✅ reset
          setPage("dashboard");
        }}
      />
    );
  }

  return null;
}

// =========================
// STYLES
// =========================
const styles = {
  loading: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a",
    color: "white"
  }
};