// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import { account } from "./lib/appwrite";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Lobby from "./pages/Lobby";
import WhotGame from "./WhotGame";

// =========================
// MAIN APP
// =========================
export default function App() {
  // =========================
  // STATE (PERSIST)
  // =========================
  const [page, setPage] = useState(
    localStorage.getItem("page") || "loading"
  );

  const [matchId, setMatchId] = useState(
    localStorage.getItem("matchId")
  );

  const [stake, setStake] = useState(
    Number(localStorage.getItem("stake") || 0)
  );

  // =========================
  // SESSION CHECK
  // =========================
  useEffect(() => {
    account.get()
      .then(() => {
        const savedPage = localStorage.getItem("page");

        // ✅ don't override existing page
        if (!savedPage || savedPage === "loading") {
          setPage("dashboard");
        }
      })
      .catch(() => {
        setPage("auth");
      });
  }, []);

  // =========================
  // SAVE STATE
  // =========================
  useEffect(() => {
    if (page !== "loading") {
      localStorage.setItem("page", page);
    }
  }, [page]);

  useEffect(() => {
    if (matchId) {
      localStorage.setItem("matchId", matchId);
    } else {
      localStorage.removeItem("matchId");
    }
  }, [matchId]);

  useEffect(() => {
    localStorage.setItem("stake", stake);
  }, [stake]);

  // =========================
  // SAFETY GUARD
  // =========================
  useEffect(() => {
    if (page === "game" && !matchId) {
      setPage("dashboard");
    }
  }, [page, matchId]);

  // =========================
  // LOGOUT
  // =========================
  async function logout() {
    try {
      await account.deleteSession("current");
    } catch (e) {
      console.warn(e);
    }

    localStorage.clear();

    setMatchId(null);
    setStake(0);
    setPage("auth");
  }

  // =========================
  // ROUTES
  // =========================

  // 🔄 LOADING
  if (page === "loading") {
    return (
      <div style={styles.loading}>
        <h2>🎮 Win9ja</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // 🔐 AUTH
  if (page === "auth") {
    return <Auth onLogin={() => setPage("dashboard")} />;
  }

  // 🏠 DASHBOARD
  if (page === "dashboard") {
    return (
      <Dashboard
        goLobby={() => setPage("lobby")}
        goWallet={() => setPage("wallet")}
        logout={logout}
      />
    );
  }

  // 💳 WALLET
  if (page === "wallet") {
    return <Wallet goTo={(p) => setPage(p)} />;
  }

  // 🎮 LOBBY → DIRECT GAME
  if (page === "lobby") {
    return (
      <Lobby
        goGame={(id, s) => {
          setMatchId(id);   // ✅ matchId = gameId
          setStake(s);
          setPage("game");  // 🚀 direct entry
        }}
        back={() => setPage("dashboard")}
      />
    );
  }

  // 🎯 GAME
  if (page === "game") {
    return (
      <WhotGame
        gameId={matchId}   // ✅ same ID
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