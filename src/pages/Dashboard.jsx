import { useEffect, useState } from "react";
import { account } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";

const ADMIN_ID = "69ef9fe863a02a7490b4";
const THEME_KEY = "win9ja-theme";

// Display conversion rate: 1,000 coins = $1
const COINS_PER_USD = 1000;

const THEMES = {
  dark: {
    "--app-bg": "#0b1220",
    "--app-text": "#ffffff",
    "--app-card": "#111827",
    "--app-border": "#1f2937",
    "--app-secondary": "#cbd5e1",
    "--app-input": "#111827",
    "--app-muted": "#94a3b8",
  },
  light: {
    "--app-bg": "#f3f6fb",
    "--app-text": "#172033",
    "--app-card": "#ffffff",
    "--app-border": "#dbe2ea",
    "--app-secondary": "#475569",
    "--app-input": "#ffffff",
    "--app-muted": "#64748b",
  },
};

export default function Dashboard({
  goLobby,
  goCasino,
  goWallet,
  goTransactions,
  goAdmin,
  goSnakeLobby,
  goMineGame,
  logout,
}) {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) !== "light";
    } catch {
      return true;
    }
  });

  // Apply theme.
  useEffect(() => {
    const themeName = isDark ? "dark" : "light";
    const theme = THEMES[themeName];

    try {
      localStorage.setItem(THEME_KEY, themeName);
    } catch (error) {
      console.error("Unable to save theme:", error);
    }

    Object.entries(theme).forEach(([property, value]) => {
      document.documentElement.style.setProperty(
        property,
        value
      );
    });

    document.documentElement.style.colorScheme = themeName;
    document.body.style.backgroundColor = theme["--app-bg"];
    document.body.style.color = theme["--app-text"];
  }, [isDark]);

  // Load user and wallet.
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const currentUser = await account.get();

        if (!active) return;

        setUser(currentUser);

        const currentWallet = await getWallet(currentUser.$id);

        if (!active) return;

        setWallet(currentWallet || null);
      } catch (error) {
        console.error("Dashboard loading error:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  // Coins balance.
  const coinBalance = Number(wallet?.coins ?? 0) || 0;

  // USD equivalent.
  const usdBalance = coinBalance / COINS_PER_USD;

  // Open support chat.
  function openWhatsApp() {
    const message =
      "Hello Support, I need help with my account";

    const url = `https://wa.me/18622726355?text=${encodeURIComponent(
      message
    )}`;

    window.open(url, "_blank", "noopener,noreferrer");

    setMenuOpen(false);
  }

  // Run navigation callbacks.
  function runMenuAction(action) {
    setMenuOpen(false);

    if (typeof action === "function") {
      action();
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <style>{`
          .dashboard-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--app-bg, #0b1220);
            color: var(--app-text, white);
            font-family: Arial, sans-serif;
          }
        `}</style>

        Loading Win9ja Dashboard...
      </div>
    );
  }

  return (
    <div
      className={`dashboard-page ${
        isDark ? "dark-theme" : "light-theme"
      }`}
    >
      <style>{`
        .dashboard-page {
          --dash-gold: #facc15;
          min-height: 100vh;
          padding: 16px;
          background: var(--app-bg, #0b1220);
          color: var(--app-text, white);
          font-family: Arial, Helvetica, sans-serif;
          transition: background-color .2s ease, color .2s ease;
        }

        .dashboard-page *,
        .dashboard-page *::before,
        .dashboard-page *::after {
          box-sizing: border-box;
        }

        .dashboard-inner {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
        }

        .dashboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 22px;
        }

        .dashboard-brand {
          min-width: 0;
        }

        .dashboard-title {
          margin: 0;
          color: var(--dash-gold);
          font-size: clamp(21px, 4vw, 30px);
          font-weight: 800;
        }

        .dashboard-subtitle {
          margin: 7px 0 0;
          color: var(--app-secondary);
          font-size: 13px;
        }

        .dashboard-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dashboard-icon-button,
        .dashboard-theme-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 42px;
          padding: 9px 12px;
          border: 1px solid var(--app-border);
          border-radius: 12px;
          background: var(--app-card);
          color: var(--app-text);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .dashboard-icon-button {
          width: 44px;
          padding: 0;
          font-size: 23px;
        }

        .dashboard-icon-button:hover,
        .dashboard-theme-button:hover {
          border-color: #22c55e;
        }

        .dashboard-menu-wrap {
          position: relative;
        }

        .dashboard-dropdown {
          position: absolute;
          z-index: 50;
          top: 51px;
          right: 0;
          width: min(270px, calc(100vw - 32px));
          max-height: 75vh;
          overflow-y: auto;
          padding: 8px;
          border: 1px solid var(--app-border);
          border-radius: 15px;
          background: var(--app-card);
          box-shadow: 0 16px 40px rgba(0,0,0,.28);
        }

        .dashboard-dropdown button {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: var(--app-text);
          text-align: left;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
        }

        .dashboard-dropdown button:hover {
          background: rgba(128,128,128,.14);
        }

        .dashboard-dropdown .dashboard-dropdown-admin {
          color: #a78bfa;
        }

        .dashboard-dropdown .dashboard-dropdown-logout {
          color: #ef4444;
        }

        .dashboard-dropdown-divider {
          height: 1px;
          margin: 6px 4px;
          background: var(--app-border);
        }

        /* Clickable coins balance card */
        .dashboard-balance-card {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 14px;
          width: 100%;
          padding: 20px;
          margin: 0 0 26px;
          overflow: hidden;
          border: 1px solid var(--app-border);
          border-radius: 18px;
          background: var(--app-card);
          color: var(--app-text);
          text-align: left;
          font: inherit;
          cursor: pointer;
          transition:
            background-color .2s ease,
            border-color .2s ease,
            transform .2s ease;
        }

        .dashboard-balance-card:hover {
          border-color: #22c55e;
          transform: translateY(-2px);
        }

        .dashboard-balance-card:focus-visible {
          outline: 3px solid #22c55e;
          outline-offset: 3px;
        }

        .dashboard-balance-label {
          margin: 0 0 8px;
          color: var(--app-secondary);
          font-size: 13px;
        }

        .dashboard-balance-value {
          margin: 0;
          color: var(--app-text);
          font-size: clamp(23px, 4vw, 32px);
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .dashboard-balance-icon {
          font-size: 44px;
        }

        .dashboard-usd-box {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 7px;
          margin-top: 13px;
          padding: 10px 12px;
          border: 1px solid var(--app-border);
          border-radius: 10px;
          background: var(--app-bg);
        }

        .dashboard-usd-label {
          color: var(--app-secondary);
          font-size: 13px;
        }

        .dashboard-usd-value {
          color: #22c55e;
          font-size: 20px;
          font-weight: 800;
        }

        .dashboard-conversion-note {
          margin: 9px 0 0;
          color: var(--app-muted);
          font-size: 11px;
          line-height: 1.5;
        }

        .dashboard-open-wallet {
          margin: 12px 0 0;
          color: #22c55e;
          font-size: 13px;
          font-weight: 800;
        }

        .dashboard-section-title {
          margin: 26px 0 13px;
          color: var(--app-secondary);
          font-size: 18px;
          font-weight: 800;
        }

        .dashboard-game-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 13px;
        }

        .dashboard-game-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          min-width: 0;
          min-height: 165px;
          padding: 16px;
          border: 1px solid #ffffff24;
          border-radius: 16px;
          color: white;
          box-shadow: 0 5px 14px rgba(0,0,0,.12);
          cursor: pointer;
          transition: transform .18s ease, filter .18s ease;
        }

        .dashboard-game-card:hover {
          transform: translateY(-3px);
          filter: brightness(1.08);
        }

        .dashboard-game-card:focus-visible {
          outline: 3px solid #22c55e;
          outline-offset: 3px;
        }

        .dashboard-game-whot {
          background: #2563eb;
        }

        .dashboard-game-snake {
          background: #16a34a;
        }

        .dashboard-game-casino {
          background: #b97708;
        }

        .dashboard-game-mines {
          background: #dc2626;
        }

        .dashboard-game-icon {
          margin-bottom: 12px;
          font-size: 30px;
        }

        .dashboard-game-name {
          margin: 0 0 7px;
          font-size: 17px;
          font-weight: 800;
          line-height: 1.3;
        }

        .dashboard-game-description {
          margin: 0;
          color: rgba(255,255,255,.88);
          font-size: 12px;
          line-height: 1.5;
        }

        .dashboard-logout {
          width: 100%;
          margin-top: 22px;
          padding: 15px;
          border: none;
          border-radius: 12px;
          background: #dc2626;
          color: white;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .dashboard-logout:hover {
          background: #b91c1c;
        }

        .dashboard-footer {
          padding: 24px 0 10px;
          color: var(--app-muted);
          text-align: center;
          font-size: 11px;
          line-height: 1.7;
        }

        @media (min-width: 650px) {
          .dashboard-page {
            padding: 25px;
          }

          .dashboard-game-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 16px;
          }

          .dashboard-game-card {
            min-height: 190px;
            padding: 18px;
          }
        }

        @media (max-width: 390px) {
          .dashboard-page {
            padding: 11px;
          }

          .dashboard-header-actions {
            gap: 5px;
          }

          .dashboard-theme-button {
            padding: 9px;
            font-size: 12px;
          }

          .dashboard-game-card {
            min-height: 155px;
            padding: 12px;
          }

          .dashboard-game-name {
            font-size: 15px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-page *,
          .dashboard-page *::before,
          .dashboard-page *::after {
            transition: none !important;
          }
        }
      `}</style>

      <div className="dashboard-inner">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-brand">
            <h2 className="dashboard-title">
              🎮 Win9ja Dashboard
            </h2>

            <p className="dashboard-subtitle">
              Welcome back
              {user?.name ? `, ${user.name}` : ""}!
            </p>
          </div>

          <div className="dashboard-header-actions">
            <button
              type="button"
              className="dashboard-theme-button"
              onClick={() => setIsDark((previous) => !previous)}
              aria-label={
                isDark
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
            >
              {isDark ? "☀️ Light" : "🌙 Dark"}
            </button>

            <div className="dashboard-menu-wrap">
              <button
                type="button"
                className="dashboard-icon-button"
                aria-label={
                  menuOpen ? "Close menu" : "Open menu"
                }
                aria-expanded={menuOpen}
                onClick={() =>
                  setMenuOpen((previous) => !previous)
                }
              >
                {menuOpen ? "✕" : "☰"}
              </button>

              {menuOpen && (
                <nav
                  className="dashboard-dropdown"
                  aria-label="Dashboard menu"
                >
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                  >
                    🏠 Dashboard
                  </button>

                  <button
                    type="button"
                    onClick={() => runMenuAction(goLobby)}
                  >
                    🎴 Games Lobby / WHOT
                  </button>

                  <button
                    type="button"
                    onClick={() => runMenuAction(goSnakeLobby)}
                  >
                    🐍 Snake & Ladder
                  </button>

                  <button
                    type="button"
                    onClick={() => runMenuAction(goCasino)}
                  >
                    🎰 Jackpot
                  </button>

                  <button
                    type="button"
                    onClick={() => runMenuAction(goMineGame)}
                  >
                    💣 Mines
                  </button>

                  <div className="dashboard-dropdown-divider" />

                  <button
                    type="button"
                    onClick={() => runMenuAction(goWallet)}
                  >
                    💰 Wallet Balance
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      runMenuAction(goTransactions)
                    }
                  >
                    📊 Transactions
                  </button>

                  <button
                    type="button"
                    onClick={openWhatsApp}
                  >
                    💬 Support
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      window.alert(
                        "About Win9ja Life — Coming soon!"
                      );
                    }}
                  >
                    ℹ️ About
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      window.alert(
                        "Win9ja Life instructions — Coming soon!"
                      );
                    }}
                  >
                    📘 Instructions
                  </button>

                  {user?.$id === ADMIN_ID && (
                    <button
                      type="button"
                      className="dashboard-dropdown-admin"
                      onClick={() => runMenuAction(goAdmin)}
                    >
                      🛠 Admin Panel
                    </button>
                  )}

                  <div className="dashboard-dropdown-divider" />

                  <button
                    type="button"
                    className="dashboard-dropdown-logout"
                    onClick={() => runMenuAction(logout)}
                  >
                    🚪 Logout
                  </button>
                </nav>
              )}
            </div>
          </div>
        </header>

        {/* Clickable coins balance card */}
        <button
          type="button"
          className="dashboard-balance-card"
          aria-label="Open wallet and view your coins balance"
          onClick={() => runMenuAction(goWallet)}
        >
          <div>
            <p className="dashboard-balance-label">
              🪙 Win9ja Coins Balance
            </p>

            <h3 className="dashboard-balance-value">
              {coinBalance.toLocaleString("en-US")} Coins
            </h3>

            <div className="dashboard-usd-box">
              <span className="dashboard-usd-label">
                USD Equivalent
              </span>

              <span className="dashboard-usd-value">
                $
                {usdBalance.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <p className="dashboard-conversion-note">
              Display rate: 1,000 Coins = $1 USD.
              This is a display calculation only.
            </p>

            <p className="dashboard-open-wallet">
              Tap to open wallet →
            </p>
          </div>

          <div
            className="dashboard-balance-icon"
            aria-hidden="true"
          >
            🪙
          </div>
        </button>

        {/* Games */}
        <h3 className="dashboard-section-title">
          🎮 Games
        </h3>

        <div className="dashboard-game-grid">
          <div
            className="dashboard-game-card dashboard-game-whot"
            role="button"
            tabIndex={0}
            onClick={() => runMenuAction(goLobby)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" ||
                event.key === " "
              ) {
                event.preventDefault();
                runMenuAction(goLobby);
              }
            }}
          >
            <div>
              <div className="dashboard-game-icon">🎴</div>
              <h4 className="dashboard-game-name">WHOT</h4>
              <p className="dashboard-game-description">
                Card battle game
              </p>
            </div>
          </div>

          <div
            className="dashboard-game-card dashboard-game-snake"
            role="button"
            tabIndex={0}
            onClick={() => runMenuAction(goSnakeLobby)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" ||
                event.key === " "
              ) {
                event.preventDefault();
                runMenuAction(goSnakeLobby);
              }
            }}
          >
            <div>
              <div className="dashboard-game-icon">🐍</div>
              <h4 className="dashboard-game-name">
                Snake & Ladder
              </h4>
              <p className="dashboard-game-description">
                Race to 100 tiles
              </p>
            </div>
          </div>

          <div
            className="dashboard-game-card dashboard-game-casino"
            role="button"
            tabIndex={0}
            onClick={() => runMenuAction(goCasino)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" ||
                event.key === " "
              ) {
                event.preventDefault();
                runMenuAction(goCasino);
              }
            }}
          >
            <div>
              <div className="dashboard-game-icon">🎰</div>
              <h4 className="dashboard-game-name">
                Jackpot
              </h4>
              <p className="dashboard-game-description">
                Spin & win rewards
              </p>
            </div>
          </div>

          <div
            className="dashboard-game-card dashboard-game-mines"
            role="button"
            tabIndex={0}
            onClick={() => runMenuAction(goMineGame)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" ||
                event.key === " "
              ) {
                event.preventDefault();
                runMenuAction(goMineGame);
              }
            }}
          >
            <div>
              <div className="dashboard-game-icon">💣</div>
              <h4 className="dashboard-game-name">
                Mines
              </h4>
              <p className="dashboard-game-description">
                Risk & reward mining game
              </p>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          className="dashboard-logout"
          onClick={() => runMenuAction(logout)}
        >
          🚪 Logout
        </button>

        <footer className="dashboard-footer">
          <div>
            © {new Date().getFullYear()} Win9ja Life
          </div>

          <div>
            Your world. Your game. Your journey.
          </div>
        </footer>
      </div>
    </div>
  );
}