// =========================
// IMPORTS (🔥 FIXED)
// =========================
import { useEffect, useState } from "react";
import {
  BrowserRouter,
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
import WhotGame from "./WhotGame";

// =========================
// AUTH WRAPPER
// =========================
function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    account.get()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  return authed ? children : <Navigate to="/auth" replace />;
}

// =========================
// GAME WRAPPER
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
// APP ROUTES
// =========================
function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>

      {/* AUTH */}
      <Route
        path="/auth"
        element={<Auth onLogin={() => navigate("/dashboard")} />}
      />

      {/* DASHBOARD */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard
              goLobby={() => navigate("/lobby")}
              goWallet={() => navigate("/wallet")}
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
            <Wallet back={() => navigate("/dashboard")} />
          </ProtectedRoute>
        }
      />

      {/* LOBBY */}
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

      {/* GAME */}
      <Route
        path="/game/:gameId/:stake"
        element={
          <ProtectedRoute>
            <GameWrapper />
          </ProtectedRoute>
        }
      />

      {/* DEFAULT */}
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

// =========================
// MAIN EXPORT
// =========================
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}