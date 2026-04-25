import { useEffect, useState } from "react";
import { account } from "./lib/appwrite";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Lobby from "./pages/Lobby";
import Match from "./pages/Match";
import WhotGame from "./WhotGame";

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

  const [gameId, setGameId] = useState(
    localStorage.getItem("gameId")
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
    if (gameId) {
      localStorage.setItem("gameId", gameId);
    } else {
      localStorage.removeItem("gameId");
    }
  }, [gameId]);

  useEffect(() => {
    localStorage.setItem("stake", stake);
  }, [stake]);

  // =========================
  // SAFETY
  // =========================
  useEffect(() => {
    if (page === "match" && !matchId) {
      setPage("dashboard");
    }

    if (page === "game" && !gameId) {
      setPage("dashboard");
    }
  }, [page, matchId, gameId]);

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
    setGameId(null);
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
          setGameId(null); // reset game
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

        // ✅🔥 CRITICAL FIX HERE
        startGame={(newGameId) => {
          setGameId(newGameId);   // store REAL game id
          setPage("game");
        }}

        cancel={() => {
          setMatchId(null);
          setGameId(null);
          setStake(0);
          setPage("dashboard");
        }}
      />
    );
  }

  if (page === "game") {
    return (
      <WhotGame
        gameId={gameId}   // ✅ USE REAL GAME ID
        stake={stake}
        goHome={() => {
          setMatchId(null);
          setGameId(null);
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