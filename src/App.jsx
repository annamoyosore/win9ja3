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
  // STATE (PERSISTED)
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
  // SAFE NAVIGATION FUNCTION 🔥
  // =========================
  function navigate(nextPage, data = {}) {
    setPage(nextPage);
    localStorage.setItem("page", nextPage);

    if (data.matchId !== undefined) {
      setMatchId(data.matchId);
      if (data.matchId) {
        localStorage.setItem("matchId", data.matchId);
      } else {
        localStorage.removeItem("matchId");
      }
    }

    if (data.stake !== undefined) {
      setStake(data.stake);
      localStorage.setItem("stake", data.stake);
    }
  }

  // =========================
  // SESSION CHECK
  // =========================
  useEffect(() => {
    account.get()
      .then(() => {
        const savedPage = localStorage.getItem("page");

        if (!savedPage || savedPage === "loading") {
          navigate("dashboard");
        }
      })
      .catch(() => {
        navigate("auth");
      });
  }, []);

  // =========================
  // SAFETY GUARD
  // =========================
  useEffect(() => {
    if (page === "game" && !matchId) {
      navigate("dashboard");
    }
  }, [page, matchId]);

  // =========================
  // BLOCK APP EXIT (ANDROID FIX)
// =========================
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
  }, []);

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
    navigate("auth");
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
    return <Auth onLogin={() => navigate("dashboard")} />;
  }

  // 🏠 DASHBOARD
  if (page === "dashboard") {
    return (
      <Dashboard
        goLobby={() => navigate("lobby")}
        goWallet={() => navigate("wallet")}
        logout={logout}
      />
    );
  }

  // 💳 WALLET
  if (page === "wallet") {
    return (
      <Wallet
        goTo={(p) => navigate(p)}
      />
    );
  }

  // 🎮 LOBBY
  if (page === "lobby") {
    return (
      <Lobby
        goGame={(id, s) => {
          navigate("game", {
            matchId: id,
            stake: s
          });
        }}
        back={() => navigate("dashboard")}
      />
    );
  }

  // 🎯 GAME
  if (page === "game") {
    return (
      <WhotGame
        gameId={matchId}
        stake={stake}
        goHome={() => {
          navigate("dashboard", {
            matchId: null,
            stake: 0
          });
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