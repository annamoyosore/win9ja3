// src/pages/Dashboard.jsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";

// Keep this consistent with your wallet's existing coin conversion.
const COINS_PER_DOLLAR = 1000;

// Your Win9ja Life admin user ID.
const ADMIN_USER_ID = "69ef9fe863a02a7490b4";

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const currentUser = await account.get();

        if (!active) return;

        setUser(currentUser);

        const wallet = await getWallet(currentUser.$id);

        if (!active) return;

        setCoins(Number(wallet?.coins ?? 0));
      } catch (err) {
        console.error("Dashboard loading error:", err);

        if (active) {
          setError(
            "Unable to load your account or wallet. Please sign in again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const usdValue = coins / COINS_PER_DOLLAR;

  function openPage(path) {
    setMenuOpen(false);
    navigate(path);
  }

  async function handleLogout() {
    try {
      await account.deleteSession("current");
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
      setError("Unable to log out. Please try again.");
    }
  }

  const games = [
    {
      id: "whot",
      title: "WHOT",
      description: "Challenge other players in a classic card game.",
      icon: "🃏",
      className: "whot",
      badge: "CARD GAME",
    },
    {
      id: "mines",
      title: "Mines",
      description: "Test your luck and make careful choices.",
      icon: "💎",
      className: "mines",
      badge: "STRATEGY",
    },
    {
      id: "snake",
      title: "Snake & Ladder",
      description: "Climb the ladder and race to the finish.",
      icon: "🐍",
      className: "snake",
      badge: "BOARD GAME",
    },
    {
      id: "jackpot",
      title: "Jackpot",
      description: "Try your luck with the jackpot game.",
      icon: "🎰",
      className: "jackpot",
      badge: "LUCK",
    },
    {
      id: "spin",
      title: "Lucky Spin",
      description: "Give the lucky wheel a spin.",
      icon: "🎡",
      className: "spin",
      badge: "SPIN",
    },
  ];

  return (
    <div className="wl-dashboard">
      <style>{`
        .wl-dashboard {
          --app-bg: #07110d;
          --app-text: #f4fff7;
          --app-card: #101e17;
          --app-border: #263c2e;
          --app-secondary: #a8b9ad;
          --app-muted: #819588;
          --app-green: #22c55e;
          --app-dark-green: #123d25;

          min-height: 100vh;
          padding: 20px;
          background: var(--app-bg);
          color: var(--app-text);
          font-family: Arial, Helvetica, sans-serif;
          box-sizing: border-box;
        }

        .wl-dashboard *,
        .wl-dashboard *::before,
        .wl-dashboard *::after {
          box-sizing: border-box;
        }

        .wl-container {
          width: 100%;
          max-width: 1150px;
          margin: 0 auto;
        }

        .wl-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 28px;
        }

        .wl-brand {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .wl-logo {
          width: 46px;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 14px;
          color: #052e16;
          background: var(--app-green);
          font-size: 25px;
          font-weight: 900;
        }

        .wl-brand h1 {
          margin: 0;
          font-size: 21px;
          letter-spacing: -0.6px;
        }

        .wl-brand p {
          margin: 4px 0 0;
          color: var(--app-muted);
          font-size: 12px;
        }

        .wl-menu-wrap {
          position: relative;
        }

        .wl-menu-button {
          width: 44px;
          height: 44px;
          border: 1px solid var(--app-border);
          border-radius: 13px;
          color: white;
          background: var(--app-card);
          font-size: 24px;
          cursor: pointer;
        }

        .wl-dropdown {
          position: absolute;
          z-index: 20;
          top: 53px;
          right: 0;
          width: 220px;
          padding: 8px;
          border: 1px solid var(--app-border);
          border-radius: 15px;
          background: #102018;
          box-shadow: 0 15px 40px #0008;
        }

        .wl-dropdown button {
          width: 100%;
          padding: 12px;
          border: 0;
          border-radius: 9px;
          color: var(--app-text);
          background: transparent;
          text-align: left;
          cursor: pointer;
          font-size: 14px;
        }

        .wl-dropdown button:hover {
          background: #1c3425;
        }

        .wl-dropdown .wl-logout {
          color: #fca5a5;
        }

        .wl-welcome {
          margin-bottom: 24px;
        }

        .wl-welcome h2 {
          margin: 0 0 8px;
          font-size: clamp(24px, 4vw, 34px);
          letter-spacing: -1px;
        }

        .wl-welcome p {
          margin: 0;
          color: var(--app-secondary);
          line-height: 1.6;
          font-size: 14px;
        }

        .wl-balance-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 15px;
          margin-bottom: 30px;
        }

        .wl-balance-card {
          position: relative;
          overflow: hidden;
          min-width: 0;
          padding: 20px;
          border: 1px solid var(--app-border);
          border-radius: 19px;
          background: var(--app-card);
        }

        .wl-balance-card.coins {
          border-color: #28663c;
          background: linear-gradient(135deg, #133a23, #101e17 80%);
        }

        .wl-balance-card.dollars {
          background: linear-gradient(135deg, #142c32, #101e17 80%);
        }

        .wl-balance-label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--app-secondary);
          font-size: 13px;
        }

        .wl-balance-icon {
          font-size: 21px;
        }

        .wl-balance-value {
          margin-top: 15px;
          overflow-wrap: anywhere;
          font-size: clamp(22px, 4vw, 34px);
          font-weight: 800;
          letter-spacing: -0.8px;
        }

        .wl-balance-note {
          margin-top: 9px;
          color: var(--app-muted);
          font-size: 11px;
          line-height: 1.5;
        }

        .wl-section-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0 0 16px;
        }

        .wl-section-heading h3 {
          margin: 0;
          font-size: 21px;
        }

        .wl-section-heading span {
          color: var(--app-muted);
          font-size: 12px;
        }

        .wl-games-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .wl-game-card {
          position: relative;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 220px;
          overflow: hidden;
          padding: 18px;
          border: 1px solid var(--app-border);
          border-radius: 19px;
          background: var(--app-card);
          transition: transform 0.2s, border-color 0.2s;
        }

        .wl-game-card:hover {
          transform: translateY(-3px);
          border-color: #3d7550;
        }

        .wl-game-card::before {
          position: absolute;
          top: -48px;
          right: -35px;
          width: 140px;
          height: 140px;
          border-radius: 50%;
          content: "";
          opacity: 0.3;
          filter: blur(3px);
          pointer-events: none;
        }

        .wl-game-card.whot::before {
          background: #eab308;
        }

        .wl-game-card.mines::before {
          background: #22c55e;
        }

        .wl-game-card.snake::before {
          background: #84cc16;
        }

        .wl-game-card.jackpot::before {
          background: #ef4444;
        }

        .wl-game-card.spin::before {
          background: #a855f7;
        }

        .wl-game-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .wl-game-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border: 1px solid #ffffff12;
          border-radius: 18px;
          background: #ffffff09;
          font-size: 38px;
        }

        .wl-game-badge {
          padding: 6px 8px;
          border: 1px solid #ffffff14;
          border-radius: 8px;
          color: #c7d9cd;
          background: #ffffff08;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .wl-game-card h4 {
          margin: 17px 0 7px;
          font-size: 19px;
        }

        .wl-game-card p {
          flex: 1;
          margin: 0 0 18px;
          color: var(--app-secondary);
          font-size: 12px;
          line-height: 1.6;
        }

        .wl-play-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          min-height: 43px;
          padding: 11px 14px;
          border: 0;
          border-radius: 11px;
          color: #052e16;
          background: var(--app-green);
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.2s;
        }

        .wl-play-button:hover {
          background: #4ade80;
        }

        .wl-footer {
          margin-top: 28px;
          padding: 18px 0 8px;
          border-top: 1px solid var(--app-border);
          color: var(--app-muted);
          text-align: center;
          font-size: 11px;
          line-height: 1.8;
        }

        .wl-error {
          margin-bottom: 20px;
          padding: 14px;
          border: 1px solid #7f1d1d;
          border-radius: 12px;
          color: #fecaca;
          background: #450a0a55;
          font-size: 13px;
          line-height: 1.6;
        }

        .wl-loading {
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 15px;
          color: var(--app-secondary);
        }

        .wl-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #294332;
          border-top-color: var(--app-green);
          border-radius: 50%;
          animation: wl-spin 0.8s linear infinite;
        }

        @keyframes wl-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (min-width: 760px) {
          .wl-dashboard {
            padding: 28px;
          }

          .wl-games-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .wl-game-card {
            min-height: 235px;
            padding: 21px;
          }
        }

        @media (max-width: 420px) {
          .wl-dashboard {
            padding: 14px;
          }

          .wl-brand h1 {
            font-size: 18px;
          }

          .wl-brand p {
            font-size: 11px;
          }

          .wl-balance-grid {
            gap: 9px;
          }

          .wl-balance-card {
            padding: 13px;
            border-radius: 15px;
          }

          .wl-balance-label {
            gap: 5px;
            font-size: 11px;
          }

          .wl-balance-icon {
            font-size: 17px;
          }

          .wl-balance-value {
            font-size: 21px;
          }

          .wl-game-card {
            min-height: 220px;
            padding: 13px;
          }

          .wl-game-icon {
            width: 50px;
            height: 50px;
            font-size: 30px;
          }

          .wl-game-badge {
            font-size: 8px;
          }

          .wl-game-card h4 {
            font-size: 16px;
          }

          .wl-game-card p {
            font-size: 11px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .wl-spinner {
            animation: none;
          }

          .wl-game-card,
          .wl-play-button {
            transition: none;
          }
        }
      `}</style>

      <div className="wl-container">
        {loading ? (
          <div className="wl-loading">
            <div className="wl-spinner" />
            <p>Loading your Win9ja Life dashboard...</p>
          </div>
        ) : (
          <>
            <header className="wl-header">
              <div className="wl-brand">
                <div className="wl-logo">W</div>

                <div>
                  <h1>Win9ja Life</h1>
                  <p>Your world. Your game. Your journey.</p>
                </div>
              </div>

              <div className="wl-menu-wrap">
                <button
                  type="button"
                  className="wl-menu-button"
                  aria-label="Open navigation menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((previous) => !previous)}
                >
                  ☰
                </button>

                {menuOpen && (
                  <div className="wl-dropdown">
                    <button onClick={() => openPage("/dashboard")}>
                      🏠 Dashboard
                    </button>

                    <button onClick={() => openPage("/lobby")}>
                      🎮 Games Lobby
                    </button>

                    <button onClick={() => openPage("/wallet")}>
                      🪙 My Wallet
                    </button>

                    <button onClick={() => openPage("/transactions")}>
                      📊 Transactions
                    </button>

                    <button onClick={() => openPage("/instructions")}>
                      📖 Instructions
                    </button>

                    <button onClick={() => openPage("/about")}>
                      ℹ️ About Win9ja Life
                    </button>

                    {user?.$id === ADMIN_USER_ID && (
                      <button onClick={() => openPage("/admin")}>
                        🛠️ Admin Panel
                      </button>
                    )}

                    <button
                      className="wl-logout"
                      onClick={handleLogout}
                    >
                      🚪 Log Out
                    </button>
                  </div>
                )}
              </div>
            </header>

            {error && (
              <div className="wl-error" role="alert">
                {error}
              </div>
            )}

            <section className="wl-welcome">
              <h2>
                Welcome back
                {user?.name ? `, ${user.name}` : ""}! 👋
              </h2>

              <p>
                Ready to play? Explore your favourite games and
                continue your Win9ja Life journey.
              </p>
            </section>

            <section aria-label="Wallet balances">
              <div className="wl-balance-grid">
                <div className="wl-balance-card coins">
                  <div className="wl-balance-label">
                    <span className="wl-balance-icon">🪙</span>
                    Coin Balance
                  </div>

                  <div className="wl-balance-value">
                    {coins.toLocaleString("en-NG")}
                  </div>

                  <div className="wl-balance-note">
                    Your available game coins
                  </div>
                </div>

                <div className="wl-balance-card dollars">
                  <div className="wl-balance-label">
                    <span className="wl-balance-icon">💵</span>
                    USD Equivalent
                  </div>

                  <div className="wl-balance-value">
                    $
                    {usdValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>

                  <div className="wl-balance-note">
                    Display conversion: 1,000 coins = $1
                  </div>
                </div>
              </div>
            </section>

            <section aria-label="Available games">
              <div className="wl-section-heading">
                <h3>Explore Games 🎮</h3>
                <span>Choose a game to continue</span>
              </div>

              <div className="wl-games-grid">
                {games.map((game) => (
                  <article
                    className={`wl-game-card ${game.className}`}
                    key={game.id}
                  >
                    <div className="wl-game-top">
                      <div className="wl-game-icon">
                        {game.icon}
                      </div>

                      <span className="wl-game-badge">
                        {game.badge}
                      </span>
                    </div>

                    <h4>{game.title}</h4>

                    <p>{game.description}</p>

                    <button
                      type="button"
                      className="wl-play-button"
                      onClick={() => openPage("/lobby")}
                    >
                      Play Now <span aria-hidden="true">→</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <footer className="wl-footer">
              <div>© {new Date().getFullYear()} Win9ja Life</div>
              <div>Play responsibly. Enjoy the experience.</div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}