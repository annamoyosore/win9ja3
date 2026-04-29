// =========================
// IMPORTS
// =========================
import { useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams
} from "react-router-dom";

import { account } from "./lib/appwrite";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Lobby from "./pages/Lobby";
import DiceLobby from "./pages/DiceLobby";          // ✅ NEW
import Transactions from "./pages/Transactions";    // ✅ NEW
import WhotGame from "./WhotGame";

// =========================
// AUTH HOOK
// =========================
function useAuth() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    account.get()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false));
  }, []);

  return { loading, authed };
}

// =========================
// PROTECTED ROUTE
// =========================
function ProtectedRoute({ children }) {
  const { loading, authed } = useAuth();

  if (loading) return <p style={{ color: "white" }}>Loading...</p>;

  return authed ? children : <Navigate to="/auth" replace />;
}

// =========================
// PUBLIC ROUTE
// =========================
function PublicRoute({ children }) {
  const { loading, authed } = useAuth();

  if (loading) return <p style={{ color: "white" }}>Loading...</p>;

  return authed ? <Navigate to="/dashboard" replace /> : children;
}

// =========================
// WHOT GAME WRAPPER
// =========================
function GameWrapper() {
  const { gameId, stake } = useParams();
  const navigate = useNavigate();

  return (
    <WhotGame
      gameId={gameId}
      stake={Number(stake)}
      goHome={() => navigate("/dashboard")}
    />
  );
}

// =========================
// DICE GAME PLACEHOLDER
// =========================
function DiceGameWrapper() {
  const { gameId, stake } = useParams();
  const navigate = useNavigate();

  return (
    <div style={{ color: "white", padding: 20 }}>
      🎲 Dice Game Coming Soon <br />
      Game ID: {gameId} <br />
      Stake: ₦{stake} <br /><br />
      <button onClick={() => navigate("/dashboard")}>
        Back to Dashboard
      </button>
    </div>
  );
}

// =========================
// ROUTES
// =========================
function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>

      {/* AUTH */}
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <Auth onLogin={() => navigate("/dashboard")} />
          </PublicRoute>
        }
      />

      {/* DASHBOARD */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard
              goLobby={() => navigate("/lobby")}
              goWallet={() => navigate("/wallet")}
              goTransactions={() => navigate("/transactions")} // ✅ FIXED
              goDice={() => navigate("/dice")}                 // ✅ FIXED
              logout={async () => {
                await account.deleteSession("current");
                navigate("/auth");
              }}
            />
          </ProtectedRoute>
        }
      />

      {/* WALLET */}
      <Route
        path="/wallet"
        element={
          <ProtectedRoute>
            <Wallet />
          </ProtectedRoute>
        }
      />

      {/* TRANSACTIONS */}
      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <Transactions back={() => navigate("/dashboard")} />
          </ProtectedRoute>
        }
      />

      {/* WHOT LOBBY */}
      <Route
        path="/lobby"
        element={
          <ProtectedRoute>
            <Lobby
              goGame={(id, stake) =>
                navigate(`/game/${id}/${stake}`)
              }
              back={() => navigate("/dashboard")}
            />
          </ProtectedRoute>
        }
      />

      {/* DICE LOBBY */}
      <Route
        path="/dice"
        element={
          <ProtectedRoute>
            <DiceLobby
              goGame={(id, stake) =>
                navigate(`/dice-game/${id}/${stake}`)
              }
              back={() => navigate("/dashboard")}
            />
          </ProtectedRoute>
        }
      />

      {/* WHOT GAME */}
      <Route
        path="/game/:gameId/:stake"
        element={
          <ProtectedRoute>
            <GameWrapper />
          </ProtectedRoute>
        }
      />

      {/* DICE GAME */}
      <Route
        path="/dice-game/:gameId/:stake"
        element={
          <ProtectedRoute>
            <DiceGameWrapper />
          </ProtectedRoute>
        }
      />

      {/* DEFAULT */}
      <Route path="*" element={<Navigate to="/auth" replace />} />

    </Routes>
  );
}

// =========================
// MAIN APP
// =========================
export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}