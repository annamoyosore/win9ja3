// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import { account } from "./lib/appwrite";

// =========================
// PAGES
// =========================
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Lobby from "./pages/Lobby";
import Match from "./pages/Match";
import WhotGame from "./WhotGame";

// =========================
// MAIN APP
// =========================
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
  // SAFETY FIX (IMPORTANT)
  // =========================
  useEffect(() => {
    if (page === "match" && !matchId) {
      setPage("dashboard");
    }
  }, [page, matchId]);

  // =========================
  // LOGOUT
  // =========================
  async function logout() {
    try {
      await account.deleteSession("current");
    } catch {}

    setMatchId(null);
    setStake(0);
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
        goLobby={() => setPage("lobby")}   // ✅ FIXED
        goWallet={() => setPage("wallet")}
        logout={logout}
      />
    );
  }

  if (page === "wallet") {
    return <Wallet back={() => setPage("dashboard")} />;
  }

  if (page === "lobby") {
    return (
      <Lobby
        goMatch={(id, s) => {
          setMatchId(id);
          setStake(s);
          setPage("match");
        }}
        back={() => setPage("dashboard")}
      />
    );
  }

  if (page === "match") {
    return (
      <Match
        matchId={matchId}
        stake={stake}
        startGame={() => setPage("game")}
        cancel={() => {
          setMatchId(null);
          setStake(0);
          setPage("dashboard");
        }}
      />
    );
  }

  if (page === "game") {
    return (
      <WhotGame
        stake={stake}
        goHome={() => {
          setMatchId(null);
          setStake(0);
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
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
    background: "#0f172a",
    color: "#fff"
  }
};