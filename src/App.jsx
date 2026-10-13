import { useEffect, useState } from "react";

import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";

import { account } from "./lib/appwrite";

// NOTIFICATION SYSTEM
import { TurnProvider } from "./context/TurnContext";
import NotificationBell from "./components/NotificationBell";

// PAGES
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Withdraw from "./pages/Withdraw";
import Lobby from "./pages/Lobby";
import Transactions from "./pages/Transactions";
import WhotGame from "./WhotGame";
import AdminDashboard from "./pages/aaa";

// WIN9JA COINS STORE
import CoinsStore from "./components/CoinsStore";

// CASINO
import CasinoWheel from "./pages/CasinoWheel";

// SNAKE GAME
import SnakeLobby from "./pages/snakelobby";
import SnakeGame from "./pages/SnakeGame";

// MINES GAME
import MineGame from "./pages/MineGame";

const ADMIN_ID = "69ef9fe863a02a7490b4";

const THEME_STORAGE_KEY = "win9ja-theme";

// ================= THEME CONFIGURATION =================

const THEMES = {
  dark: {
    "--app-bg": "#07111f",
    "--app-text": "#f8fafc",
    "--app-card": "#101e31",
    "--app-border": "#263951",
    "--app-secondary": "#12243a",
    "--app-input": "#07111f",
    "--app-muted": "#a6b7cc",
    "--app-header": "#0b1728",
    "--app-shadow": "0 8px 24px rgba(0, 0, 0, 0.25)",
  },

  light: {
    "--app-bg": "#f3f6fb",
    "--app-text": "#172033",
    "--app-card": "#ffffff",
    "--app-border": "#dce4ef",
    "--app-secondary": "#edf2f8",
    "--app-input": "#ffffff",
    "--app-muted": "#64748b",
    "--app-header": "#ffffff",
    "--app-shadow": "0 8px 24px rgba(15, 23, 42, 0.07)",
  },
};

// ================= AUTH HOOK =================

function useAuth() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let active = true;

    account
      .get()
      .then(() => {
        if (active) setAuthed(true);
      })
      .catch(() => {
        if (active) setAuthed(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { loading, authed };
}

// ================= USER HOOK =================

function useUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    account
      .get()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { user, loading };
}

// ================= ROUTE GUARDS =================

function ProtectedRoute({ children }) {
  const { loading, authed } = useAuth();

  if (loading) {
    return (
      <p
        style={{
          color: "var(--app-text, #ffffff)",
          padding: 20,
        }}
      >
        Loading...
      </p>
    );
  }

  return authed ? children : <Navigate to="/auth" replace />;
}

function AdminRoute({ children }) {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <p
        style={{
          color: "var(--app-text, #ffffff)",
          padding: 20,
        }}
      >
        Loading...
      </p>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (user.$id !== ADMIN_ID) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { loading, authed } = useAuth();

  if (loading) {
    return (
      <p
        style={{
          color: "var(--app-text, #ffffff)",
          padding: 20,
        }}
      >
        Loading...
      </p>
    );
  }

  return authed ? (
    <Navigate to="/dashboard" replace />
  ) : (
    children
  );
}

// ================= WHOT GAME WRAPPER =================

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

// ================= SNAKE GAME WRAPPER =================

function SnakeGameWrapper() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  return (
    <SnakeGame
      gameId={gameId}
      back={() => navigate("/snake-lobby")}
    />
  );
}

// ================= GLOBAL THEME BUTTON =================

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={
        isDark
          ? "Switch to light theme"
          : "Switch to dark theme"
      }
      aria-pressed={!isDark}
      title={
        isDark
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      style={{
        minWidth: 44,
        height: 42,
        padding: "0 12px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 12,
        border: "1px solid var(--app-border)",
        background: "var(--app-card)",
        color: "var(--app-text)",
        fontSize: 18,
        cursor: "pointer",
        boxShadow: "var(--app-shadow)",
      }}
    >
      <span aria-hidden="true">
        {isDark ? "☀️" : "🌙"}
      </span>

      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {isDark ? "Light" : "Dark"}
      </span>
    </button>
  );
}

// ================= GLOBAL APP HEADER =================

function GlobalHeader({ theme, onToggleTheme }) {
  return (
    <header
      style={{
        position: "relative",
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        background: "var(--app-header)",
        borderBottom: "1px solid var(--app-border)",
        color: "var(--app-text)",
        transition:
          "background 0.2s ease, color 0.2s ease",
      }}
    >
      <ThemeToggle
        theme={theme}
        onToggle={onToggleTheme}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 42,
          minHeight: 42,
        }}
      >
        <NotificationBell />
      </div>
    </header>
  );
}

// ================= APP ROUTES =================

function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>
      {/* AUTHENTICATION */}

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
              goTransactions={() => navigate("/transactions")}
              goCasino={() => navigate("/casino")}
              goSnakeLobby={() => navigate("/snake-lobby")}
              goMineGame={() => navigate("/mines")}
              goAdmin={() => navigate("/admin")}
              logout={async () => {
                try {
                  await account.deleteSession("current");
                } finally {
                  navigate("/auth");
                }
              }}
            />
          </ProtectedRoute>
        }
      />

      {/* CASINO */}

      <Route
        path="/casino"
        element={
          <ProtectedRoute>
            <CasinoWheel />
          </ProtectedRoute>
        }
      />

      {/* MINES GAME */}

      <Route
        path="/mines"
        element={
          <ProtectedRoute>
            <MineGame />
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

      {/* WIN9JA COINS STORE */}

      <Route
        path="/coins"
        element={
          <ProtectedRoute>
            <CoinsStore />
          </ProtectedRoute>
        }
      />

      {/* WITHDRAWAL PAGE */}

      <Route
        path="/withdraw"
        element={
          <ProtectedRoute>
            <Withdraw />
          </ProtectedRoute>
        }
      />

      {/* TRANSACTIONS */}

      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <Transactions
              back={() => navigate("/dashboard")}
            />
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

      {/* WHOT GAME */}

      <Route
        path="/game/:gameId/:stake"
        element={
          <ProtectedRoute>
            <GameWrapper />
          </ProtectedRoute>
        }
      />

      {/* SNAKE LOBBY */}

      <Route
        path="/snake-lobby"
        element={
          <ProtectedRoute>
            <SnakeLobby
              goGame={(gameId) =>
                navigate(`/snake-game/${gameId}`)
              }
              back={() => navigate("/dashboard")}
            />
          </ProtectedRoute>
        }
      />

      {/* SNAKE GAME */}

      <Route
        path="/snake-game/:gameId"
        element={
          <ProtectedRoute>
            <SnakeGameWrapper />
          </ProtectedRoute>
        }
      />

      {/* ADMIN DASHBOARD */}

      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard
              back={() => navigate("/dashboard")}
            />
          </AdminRoute>
        }
      />

      {/* DEFAULT ROUTE */}

      <Route
        path="*"
        element={<Navigate to="/auth" replace />}
      />
    </Routes>
  );
}

// ================= APP ROOT =================

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem(
        THEME_STORAGE_KEY
      );

      return savedTheme === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Apply theme variables to the entire document.
  useEffect(() => {
    const root = document.documentElement;
    const selectedTheme = THEMES[theme] || THEMES.dark;

    Object.entries(selectedTheme).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.style.colorScheme = theme;

    document.body.style.backgroundColor =
      selectedTheme["--app-bg"];

    document.body.style.color =
      selectedTheme["--app-text"];

    document.body.style.margin = "0";

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.warn("Unable to save theme preference:", error);
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark"
    );
  }

  return (
    <TurnProvider>
      <HashRouter>
        <div
          data-win9ja-theme={theme}
          style={{
            minHeight: "100vh",
            background: "var(--app-bg)",
            color: "var(--app-text)",
            transition:
              "background 0.2s ease, color 0.2s ease",
          }}
        >
          <GlobalHeader
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          <AppRoutes />
        </div>
      </HashRouter>
    </TurnProvider>
  );
}