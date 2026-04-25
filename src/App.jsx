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

  useEffect(() => {
    account.get()
      .then(() => setPage("dashboard"))
      .catch(() => setPage("auth"));
  }, []);

  async function logout() {
    await account.deleteSession("current");
    setPage("auth");
  }

  if (page === "auth") return <Auth onLogin={() => setPage("dashboard")} />;

  if (page === "dashboard")
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

  if (page === "wallet")
    return <Wallet back={() => setPage("dashboard")} />;

  if (page === "match")
    return <Match matchId={matchId} startGame={() => setPage("game")} />;

  if (page === "game")
    return <WhotGame stake={stake} />;

  return <p>Loading...</p>;
      }
