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
    setPage("auth");
  }

  // =========================
  // ROUTES
  // =========================
  if (page === "loading") {
    return (
      <div style={styles.loading}>
        <h2>🎮 Win9ja</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (page === "auth") {
    return <Auth onLogin={() => setPage("dashboard")} />;
  }

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

  if (page === "wallet") {
    return <Wallet back={() => setPage("dashboard")} />;
  }

  if (page === "match") {
    return (
      <Match
        matchId={matchId}
        startGame={() => setPage("game")}
        cancel={() => setPage("dashboard")} // ✅ NEW
      />
    );
  }

  if (page === "game") {
    return (
      <WhotGame
        stake={stake}
        goHome={() => setPage("dashboard")} // ✅ IMPORTANT
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