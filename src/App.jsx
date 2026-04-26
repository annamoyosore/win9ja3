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
// AUTH WRAPPER (SAFE)
// =========================
function ProtectedRoute({ children }) {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    account.get()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return (
      <div style={{ color: "white", padding: 20 }}>
        Loading...
      </div>
    );
  }

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
// ROUTES
// =========================
function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>

      {/* 🔐 AUTH FIRST */}
      <Route
        path="/auth"
        element={
          <Auth onLogin={() => navigate("/dashboard")} />
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
                try {
                  await account.deleteSession("current");
                } catch {}
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

      {/* ✅ DEFAULT → AUTH (IMPORTANT) */}
      <Route path="*" element={<Navigate to="/auth" />} />
    </Routes>
  );
}

// =========================
// APP ROOT
// =========================
export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: "100vh", background: "#0f172a" }}>
        <AppRoutes />
      </div>
    </BrowserRouter>
  );
}