import { useEffect, useState } from "react";
import { account } from "./lib/appwrite";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Lobby from "./pages/Lobby";
import Match from "./pages/Match";
import WhotGame from "./WhotGame";

export default function App() {
  // ✅ LOAD FROM STORAGE
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
  // SESSION CHECK (FIXED)
  // =========================
  useEffect(() => {
    account.get()
      .then(() => {
        const savedPage = localStorage.getItem("page");

        // ✅ DO NOT OVERRIDE USER PAGE
        if (!savedPage || savedPage === "loading") {
          setPage("dashboard");
        }
      })
      .catch(() => {
        setPage("auth");
      });
  }, []);

  // =========================
  // SAVE STATE (IMPORTANT)
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
  // SAFETY FIX
  // =========================
  useEffect(() => {
    if ((page === "match" || page === "game") && !matchId) {
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

    // ✅ CLEAR STORAGE
    localStorage.clear();

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
        goLobby={() => setPage("lobby")}
        goWallet={() => setPage("wallet")}
        logout={logout}
      />
    );
  }

  if (page === "wallet") {
    return <Wallet goTo={(p) => setPage(p)} />;
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
        gameId={matchId}
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