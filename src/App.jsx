// =========================
// IMPORTS
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
// AUTH CHECK HOOK
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

  if (loading) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: 50 }}>
        Loading...
      </div>
    );
  }

  return authed ? children : <Navigate to="/auth" replace />;
}

// =========================
// PUBLIC ROUTE (Auth only)
// =========================
function PublicRoute({ children }) {
  const { loading, authed } = useAuth();

  if (loading) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: 50 }}>
        Loading...
      </div>
    );
  }

  // 🔥 If already logged in → skip auth page
  return !authed ? children : <Navigate to="/dashboard" replace />;
}

// =========================
// GAME WRAPPER
// =========================
function GameWrapper() {
  const { gameId, stake } = useParams();
  const navigate = useNavigate();

  if (!gameId) return <Navigate to="/dashboard" />;

  return (
    <WhotGame
      gameId={gameId}
      stake={Number(stake)}
      goHome={() => navigate("/dashboard")}
    />
  );
}

// =========================
// ROUTES
// =========================
function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>

      {/* 🔐 AUTH (ENTRY POINT) */}
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <Auth onLogin={() => navigate("/dashboard")} />
          </PublicRoute>
        }
      />

      {/* 🏠 DASHBOARD */}
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

      {/* 💳 WALLET */}
      <Route
        path="/wallet"
        element={
          <ProtectedRoute>
            <Wallet back={() => navigate("/dashboard")} />
          </ProtectedRoute>
        }
      />

      {/* 🎮 LOBBY */}
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

      {/* 🎯 GAME */}
      <Route
        path="/game/:gameId/:stake"
        element={
          <ProtectedRoute>
            <GameWrapper />
          </ProtectedRoute>
        }
      />

      {/* 🔥 DEFAULT ROUTE */}
      <Route path="/" element={<Navigate to="/auth" replace />} />

      {/* 🔥 FALLBACK */}
      <Route path="*" element={<Navigate to="/auth" replace />} />

    </Routes>
  );
}

// =========================
// MAIN APP
// =========================
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}