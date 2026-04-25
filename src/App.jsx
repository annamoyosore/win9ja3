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
    account
      .get()
      .then(() => setPage("dashboard"))
      .catch(() => setPage("auth"));
  }, []);

  // =========================
  // LOGOUT FUNCTION
  // =========================
  async function logout() {
    try {
      await account.deleteSession("current");
    } catch (e) {
      console.warn("Logout error:", e);
    }

    // reset app state
    setMatchId(null);
    setStake(0);
    setPage("auth");
  }

  // =========================
  // ROUTING SYSTEM
  // =========================

  // 🔄 LOADING PAGE
  if (page === "loading") {
    return (
      <div style={styles.loading}>
        <h2>🎮 Win9ja</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // 🔐 AUTH PAGE
  if (page === "auth") {
    return <Auth onLogin={() => setPage("dashboard")} />;
  }

  // 🏠 DASHBOARD
  if (page === "dashboard") {
    return (
      <Dashboard
        goLobby={(stakeAmount) => {
          setStake(stakeAmount);
          setPage("lobby");
        }}
        goWallet={() => setPage("wallet")}
        logout={logout}
      />
    );
  }

  // 🎮 LOBBY PAGE
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

  // 🎯 MATCH PAGE
  if (page === "match") {
    if (!matchId) {
      setPage("dashboard");
      return null;
    }

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

  // 🎮 GAME PAGE
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
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a",
    color: "white"
  }
};