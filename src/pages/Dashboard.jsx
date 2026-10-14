// ============================================
// WIN9JA LIFE — DASHBOARD
// ============================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";

// ============================================
// CONFIGURATION
// ============================================

const ADMIN_USER_ID = "69ef9fe863a02a7490b4";
const COINS_PER_DOLLAR = 1000;

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================

export default function Dashboard() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(null);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");

  // ==========================================
  // LOAD USER AND WALLET
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const user = await account.get();

        if (!active) return;

        setCurrentUser(user);

        const wallet = await getWallet(user.$id);

        if (!active) return;

        setCoins(Number(wallet?.coins ?? 0));
      } catch (err) {
        console.error("Dashboard loading error:", err);

        if (!active) return;

        setError(
          "Unable to load your account or coin balance. Please try again."
        );
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

  // ==========================================
  // CURRENCY DISPLAY
  // 1000 COINS = $1
  // ==========================================

  const dollarValue = coins / COINS_PER_DOLLAR;

  const formattedCoins = Number(coins).toLocaleString("en-US");

  const formattedDollars = dollarValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // ==========================================
  // NAVIGATION
  // ==========================================

  function openLobby() {
    setMenuOpen(false);
    navigate("/lobby");
  }

  function goTo(path) {
    setMenuOpen(false);
    navigate(path);
  }

  async function handleLogout() {
    try {
      setMenuOpen(false);
      await account.deleteSession("current");
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      setError("Unable to log out. Please try again.");
    }
  }

  // ==========================================
  // DASHBOARD UI
  // ==========================================

  return (
    <div className="win9ja-dashboard">
      <style>{globalStyles}</style>

      {/* ======================================
          TOP NAVIGATION
      ====================================== */}

      <header className="dashboard-header">
        <button
          className="brand"
          onClick={() => goTo("/dashboard")}
          aria-label="Go to dashboard"
        >
          <span className="brand-logo">W</span>

          <span className="brand-text">
            Win9ja<span>Life</span>
          </span>
        </button>

        <div className="header-actions">
          <button
            className="header-lobby-button"
            onClick={openLobby}
          >
            <span>🎮</span>
            <span>Games Lobby</span>
          </button>

          <button
            className="menu-button"
            onClick={() => setMenuOpen((previous) => !previous)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </header>

      {/* ======================================
          MINI MENU
      ====================================== */}

      {menuOpen && (
        <>
          <div
            className="menu-backdrop"
            onClick={() => setMenuOpen(false)}
          />

          <nav className="dashboard-menu">
            <div className="menu-user">
              <div className="menu-avatar">
                {currentUser?.name?.charAt(0)?.toUpperCase() || "W"}
              </div>

              <div className="menu-user-details">
                <strong>
                  {currentUser?.name || "Win9ja Player"}
                </strong>

                <small>{currentUser?.email || ""}</small>
              </div>
            </div>

            <div className="menu-divider" />

            <button onClick={() => goTo("/dashboard")}>
              <span>🏠</span>
              Dashboard
            </button>

            <button onClick={() => goTo("/lobby")}>
              <span>🎮</span>
              Games Lobby
            </button>

            <button onClick={() => goTo("/wallet")}>
              <span>🪙</span>
              My Wallet
            </button>

            <button onClick={() => goTo("/transactions")}>
              <span>📊</span>
              Transactions
            </button>

            <button onClick={() => goTo("/instructions")}>
              <span>📖</span>
              Instructions
            </button>

            <button onClick={() => goTo("/about")}>
              <span>ℹ️</span>
              About Win9ja Life
            </button>

            {currentUser?.$id === ADMIN_USER_ID && (
              <button onClick={() => goTo("/admin")}>
                <span>🛡️</span>
                Admin Dashboard
              </button>
            )}

            <div className="menu-divider" />

            <button
              className="logout-menu-button"
              onClick={handleLogout}
            >
              <span>🚪</span>
              Logout
            </button>
          </nav>
        </>
      )}

      {/* ======================================
          MAIN CONTENT
      ====================================== */}

      <main className="dashboard-main">

        {/* WELCOME SECTION */}

        <section className="welcome-section">
          <div className="welcome-copy">
            <div className="welcome-badge">
              <span className="online-dot"></span>
              YOUR GAMING WORLD
            </div>

            <h1>
              Welcome back,
              <br />

              <span>
                {currentUser?.name?.trim()?.split(/\s+/)[0] ||
                  "Player"}
                !
              </span>
            </h1>

            <p>
              Play your favourite games, explore challenges,
              and enjoy the Win9ja Life experience.
            </p>

            <button
              className="primary-play-button"
              onClick={openLobby}
            >
              <span>🎮</span>
              Explore Games
              <span className="button-arrow">→</span>
            </button>
          </div>

          <div className="welcome-art" aria-hidden="true">
            <div className="art-glow"></div>

            <div className="floating-star star-one">✦</div>
            <div className="floating-star star-two">✧</div>
            <div className="floating-star star-three">✦</div>

            <div className="hero-controller">
              <div className="controller-top">
                <span className="controller-dot"></span>
                <span className="controller-dot"></span>
              </div>

              <div className="controller-cross">
                <span className="cross-horizontal"></span>
                <span className="cross-vertical"></span>
              </div>

              <div className="controller-buttons">
                <span className="controller-button button-a">A</span>
                <span className="controller-button button-b">B</span>
              </div>
            </div>

            <div className="art-caption">
              <span>READY?</span>
              <strong>LET'S PLAY!</strong>
            </div>
          </div>
        </section>

        {/* ====================================
            WALLET SUMMARY
        ==================================== */}

        <section className="balance-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR ACCOUNT</span>
              <h2>Wallet Overview</h2>
            </div>

            <button
              className="text-link"
              onClick={() => goTo("/wallet")}
            >
              View Wallet <span>→</span>
            </button>
          </div>

          {error && (
            <div className="dashboard-error" role="alert">
              <span>⚠️</span>
              <span>{error}</span>

              <button onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}

          <div className="balance-grid">

            {/* COIN BALANCE */}

            <button
              className="balance-card coin-balance-card"
              onClick={() => goTo("/wallet")}
            >
              <div className="balance-card-top">
                <div className="balance-icon coin-icon">
                  <span>W</span>
                </div>

                <span className="balance-label">
                  WIN9JA COINS
                </span>

                <span className="balance-open">↗</span>
              </div>

              <div className="balance-number">
                {loading ? (
                  <span className="loading-shimmer"></span>
                ) : (
                  formattedCoins
                )}
              </div>

              <div className="balance-card-bottom">
                <span>Your available coins</span>
                <span className="balance-pill">COINS</span>
              </div>
            </button>

            {/* USD EQUIVALENT */}

            <button
              className="balance-card dollar-balance-card"
              onClick={() => goTo("/wallet")}
            >
              <div className="balance-card-top">
                <div className="balance-icon dollar-icon">
                  $
                </div>

                <span className="balance-label">
                  USD EQUIVALENT
                </span>

                <span className="balance-open">↗</span>
              </div>

              <div className="balance-number dollar-number">
                {loading ? (
                  <span className="loading-shimmer"></span>
                ) : (
                  `$${formattedDollars}`
                )}
              </div>

              <div className="balance-card-bottom">
                <span>Based on your coin balance</span>
                <span className="balance-pill dollar-pill">
                  USD
                </span>
              </div>
            </button>

          </div>

          <p className="conversion-note">
            <span>ⓘ</span>
            Display calculation: 1,000 Win9ja coins = $1 USD.
            This is an equivalent value for display, not a guarantee
            of cash value or withdrawal eligibility.
          </p>
        </section>

        {/* ====================================
            GAMES SECTION
        ==================================== */}

        <section className="games-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PICK YOUR CHALLENGE</span>
              <h2>Explore Games</h2>
              <p className="section-subtitle">
                Choose a game and continue in the Games Lobby.
              </p>
            </div>

            <button
              className="text-link desktop-lobby-link"
              onClick={openLobby}
            >
              Games Lobby <span>→</span>
            </button>
          </div>

          <div className="games-grid">

            {/* =================================
                WHOT
            ================================= */}

            <button
              className="game-card whot-card"
              onClick={openLobby}
            >
              <div className="game-card-art whot-art">
                <div className="art-light light-one"></div>
                <div className="art-light light-two"></div>

                <div className="whot-cards">
                  <div className="playing-card card-back">
                    <div className="card-back-pattern">✦</div>
                  </div>

                  <div className="playing-card card-middle">
                    <span className="card-symbol">★</span>
                    <strong>1</strong>
                  </div>

                  <div className="playing-card card-front">
                    <span className="card-top-symbol">✦</span>
                    <strong>WHOT!</strong>
                    <span className="card-bottom-symbol">✦</span>
                  </div>
                </div>

                <span className="art-tag">CLASSIC</span>
              </div>

              <div className="game-card-info">
                <div>
                  <h3>WHOT!</h3>
                  <p>Play the classic card game.</p>
                </div>

                <span className="game-arrow">→</span>
              </div>
            </button>

            {/* =================================
                MINES
            ================================= */}

            <button
              className="game-card mines-card"
              onClick={openLobby}
            >
              <div className="game-card-art mines-art">
                <div className="mine-glow"></div>

                <div className="mine-grid">
                  <span>◆</span>
                  <span>✦</span>
                  <span>◆</span>

                  <span>✦</span>
                  <span className="mine-center">✹</span>
                  <span>✦</span>

                  <span>◆</span>
                  <span>✦</span>
                  <span>◆</span>
                </div>

                <div className="mine-badge">MINES</div>
                <span className="art-tag">STRATEGY</span>
              </div>

              <div className="game-card-info">
                <div>
                  <h3>Mines</h3>
                  <p>Test your strategy and choices.</p>
                </div>

                <span className="game-arrow">→</span>
              </div>
            </button>

            {/* =================================
                SNAKE & LADDER
            ================================= */}

            <button
              className="game-card snake-card"
              onClick={openLobby}
            >
              <div className="game-card-art snake-art">
                <div className="board-grid">
                  {Array.from({ length: 25 }, (_, index) => (
                    <span
                      key={index}
                      className={
                        (index + Math.floor(index / 5)) % 2 === 0
                          ? "board-cell cell-light"
                          : "board-cell cell-dark"
                      }
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>

                <div className="ladder ladder-one">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>

                <div className="snake-decoration">〰</div>

                <div className="snake-piece">🐍</div>

                <span className="art-tag">BOARD GAME</span>
              </div>

              <div className="game-card-info">
                <div>
                  <h3>Snake & Ladder</h3>
                  <p>Climb higher and reach the finish.</p>
                </div>

                <span className="game-arrow">→</span>
              </div>
            </button>

            {/* =================================
                JACKPOT
            ================================= */}

            <button
              className="game-card jackpot-card"
              onClick={openLobby}
            >
              <div className="game-card-art jackpot-art">
                <div className="jackpot-glow"></div>

                <div className="jackpot-stars">
                  <span>✦</span>
                  <span>✧</span>
                  <span>✦</span>
                </div>

                <div className="jackpot-machine">
                  <div className="machine-top">
                    JACKPOT
                  </div>

                  <div className="slot-display">
                    <span>7</span>
                    <span>7</span>
                    <span>7</span>
                  </div>

                  <div className="machine-base">
                    <span>★</span>
                    <span>★</span>
                    <span>★</span>
                  </div>
                </div>

                <span className="art-tag">LUCK & FUN</span>
              </div>

              <div className="game-card-info">
                <div>
                  <h3>Jackpot</h3>
                  <p>Explore the jackpot game.</p>
                </div>

                <span className="game-arrow">→</span>
              </div>
            </button>

            {/* =================================
                LUCKY SPIN
            ================================= */}

            <button
              className="game-card lucky-card"
              onClick={openLobby}
            >
              <div className="game-card-art lucky-art">
                <div className="spin-glow"></div>

                <div className="spin-pointer">▼</div>

                <div className="spin-wheel">
                  <div className="wheel-segment segment-one"></div>
                  <div className="wheel-segment segment-two"></div>
                  <div className="wheel-segment segment-three"></div>
                  <div className="wheel-segment segment-four"></div>
                  <div className="wheel-segment segment-five"></div>
                  <div className="wheel-segment segment-six"></div>

                  <div className="wheel-center">W</div>
                </div>

                <div className="spin-spark spark-one">✦</div>
                <div className="spin-spark spark-two">✧</div>

                <span className="art-tag">SPIN & PLAY</span>
              </div>

              <div className="game-card-info">
                <div>
                  <h3>Lucky Spin</h3>
                  <p>Visit the lobby to explore this game.</p>
                </div>

                <span className="game-arrow">→</span>
              </div>
            </button>

          </div>

          {/* ==================================
              LOBBY CALL TO ACTION
          ================================== */}

          <div className="lobby-banner">
            <div className="lobby-banner-icon">🎮</div>

            <div className="lobby-banner-copy">
              <h3>Ready to play?</h3>

              <p>
                Enter the Games Lobby to choose from the available
                games and continue with the existing game flow.
              </p>
            </div>

            <button
              className="lobby-banner-button"
              onClick={openLobby}
            >
              Enter Lobby <span>→</span>
            </button>
          </div>
        </section>

        {/* ====================================
            FOOTER
        ==================================== */}

        <footer className="dashboard-footer">
          <div className="footer-brand">
            <span className="footer-logo">W</span>
            <strong>Win9ja Life</strong>
          </div>

          <p>Play. Connect. Enjoy.</p>

          <button
            onClick={() => goTo("/about")}
            className="footer-about-link"
          >
            About Us
          </button>
        </footer>

      </main>
    </div>
  );
}

// ============================================
// DASHBOARD STYLES
// ============================================

const globalStyles = `
.win9ja-dashboard {
  --dash-green: #16a34a;
  --dash-green-light: #22c55e;
  --dash-green-dark: #087a36;
  --dash-gold: #facc15;

  min-height: 100vh;
  background:
    radial-gradient(
      circle at 95% 2%,
      rgba(34, 197, 94, 0.10),
      transparent 25%
    ),
    var(--app-bg, #07130d);

  color: var(--app-text, #f4fff6);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.win9ja-dashboard *,
.win9ja-dashboard *::before,
.win9ja-dashboard *::after {
  box-sizing: border-box;
}

.win9ja-dashboard button {
  font: inherit;
}

.win9ja-dashboard button:focus-visible {
  outline: 3px solid var(--dash-gold);
  outline-offset: 3px;
}

.dashboard-header {
  position: sticky;
  top: 0;
  z-index: 100;

  min-height: 74px;
  padding: 12px clamp(16px, 4vw, 54px);

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;

  background: var(--app-card, #0d2115);
  border-bottom: 1px solid var(--app-border, #203c29);
  backdrop-filter: blur(18px);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;

  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.brand-logo,
.footer-logo {
  width: 43px;
  height: 43px;

  display: grid;
  place-items: center;

  border-radius: 14px;
  background: linear-gradient(145deg, #facc15, #e69c0b);
  color: #18210b;

  font-size: 24px;
  font-weight: 1000;

  box-shadow: 0 5px 20px rgba(250, 204, 21, 0.17);
}

.brand-text {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.8px;
}

.brand-text > span {
  color: var(--dash-green-light);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-lobby-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;

  padding: 11px 17px;
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 12px;

  background: rgba(22, 163, 74, 0.13);
  color: var(--app-text, #f4fff6);

  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: 0.2s ease;
}

.header-lobby-button:hover {
  background: var(--dash-green);
  color: white;
  transform: translateY(-1px);
}

.menu-button {
  width: 44px;
  height: 44px;

  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;

  border: 1px solid var(--app-border, #284431);
  border-radius: 12px;
  background: var(--app-input, #102519);
  cursor: pointer;
}

.menu-button span {
  width: 19px;
  height: 2px;
  border-radius: 5px;
  background: var(--app-text, #f4fff6);
}

/* MINI MENU */

.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(0, 0, 0, 0.35);
}

.dashboard-menu {
  position: fixed;
  top: 84px;
  right: clamp(12px, 4vw, 54px);
  z-index: 120;

  width: min(320px, calc(100vw - 24px));
  padding: 13px;

  background: var(--app-card, #0d2115);
  border: 1px solid var(--app-border, #284431);
  border-radius: 18px;

  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
  animation: menuAppear 0.18s ease-out;
}

@keyframes menuAppear {
  from {
    opacity: 0;
    transform: translateY(-7px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 7px 15px;
}

.menu-avatar {
  width: 43px;
  height: 43px;
  flex-shrink: 0;

  display: grid;
  place-items: center;

  border-radius: 50%;
  background: linear-gradient(145deg, #22c55e, #087a36);
  color: white;
  font-weight: 900;
  font-size: 18px;
}

.menu-user-details {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-user-details strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.menu-user-details small {
  color: var(--app-muted, #91a99a);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.menu-divider {
  height: 1px;
  background: var(--app-border, #284431);
  margin: 7px 0;
}

.dashboard-menu > button {
  width: 100%;
  min-height: 43px;

  display: flex;
  align-items: center;
  gap: 11px;

  padding: 10px 12px;
  border: 0;
  border-radius: 10px;

  background: transparent;
  color: var(--app-text, #f4fff6);
  text-align: left;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;

  transition: background 0.18s ease;
}

.dashboard-menu > button:hover {
  background: rgba(34, 197, 94, 0.12);
}

.dashboard-menu > button > span {
  width: 22px;
  text-align: center;
}

.dashboard-menu > .logout-menu-button {
  color: #fb7185;
}

.dashboard-menu > .logout-menu-button:hover {
  background: rgba(244, 63, 94, 0.1);
}

/* MAIN LAYOUT */

.dashboard-main {
  width: 100%;
  max-width: 1450px;

  margin: 0 auto;
  padding: 28px clamp(16px, 4vw, 54px) 35px;
}

/* WELCOME SECTION */

.welcome-section {
  position: relative;
  overflow: hidden;

  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  align-items: center;
  gap: 20px;

  min-height: 315px;
  padding: clamp(25px, 4vw, 48px);

  border: 1px solid rgba(34, 197, 94, 0.23);
  border-radius: 25px;

  background:
    radial-gradient(
      circle at 90% 45%,
      rgba(34, 197, 94, 0.2),
      transparent 35%
    ),
    linear-gradient(
      120deg,
      #0c2515,
      #0b1d12 55%,
      #12391f
    );

  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.12);
}

.welcome-copy {
  position: relative;
  z-index: 2;
}

.welcome-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  padding: 7px 11px;
  border: 1px solid rgba(74, 222, 128, 0.25);
  border-radius: 30px;

  background: rgba(34, 197, 94, 0.1);
  color: #a7f3bd;

  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.4px;
}

.online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.9);
}

.welcome-copy h1 {
  margin: 20px 0 13px;

  color: #f5fff7;
  font-size: clamp(32px, 4.6vw, 55px);
  font-weight: 950;
  line-height: 1.08;
  letter-spacing: -1.8px;
}

.welcome-copy h1 span {
  color: #4ade80;
}

.welcome-copy > p {
  max-width: 490px;
  margin: 0;

  color: #b6d0bc;
  font-size: 14px;
  line-height: 1.8;
}

.primary-play-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;

  margin-top: 24px;
  padding: 14px 19px;

  border: 0;
  border-radius: 12px;

  background: linear-gradient(135deg, #22c55e, #12843b);
  color: white;

  font-size: 13px;
  font-weight: 900;
  cursor: pointer;

  box-shadow: 0 8px 25px rgba(34, 197, 94, 0.2);
  transition: 0.2s ease;
}

.primary-play-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(34, 197, 94, 0.3);
}

.button-arrow {
  font-size: 19px;
}

/* CSS-ILLUSTRATED HERO ART */

.welcome-art {
  position: relative;
  min-height: 235px;

  display: flex;
  align-items: center;
  justify-content: center;
}

.art-glow {
  position: absolute;
  width: 220px;
  height: 220px;
  border-radius: 50%;

  background: radial-gradient(
    circle,
    rgba(74, 222, 128, 0.24),
    rgba(22, 163, 74, 0.03) 70%,
    transparent
  );
}

.hero-controller {
  position: relative;
  width: 220px;
  height: 140px;

  border: 2px solid rgba(134, 239, 172, 0.55);
  border-radius: 45px 45px 60px 60px;

  background: linear-gradient(145deg, #347b4b, #164d2a 70%, #0a3219);

  box-shadow:
    0 25px 40px rgba(0, 0, 0, 0.25),
    inset 0 3px 8px rgba(255, 255, 255, 0.15);

  transform: rotate(-8deg);
  animation: controllerFloat 4s ease-in-out infinite;
}

@keyframes controllerFloat {
  0%, 100% {
    transform: translateY(0) rotate(-8deg);
  }

  50% {
    transform: translateY(-9px) rotate(-5deg);
  }
}

.controller-top {
  position: absolute;
  top: 17px;
  right: 35px;
  display: flex;
  gap: 9px;
}

.controller-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #86efac;
  opacity: 0.85;
}

.controller-cross {
  position: absolute;
  left: 34px;
  top: 45px;
  width: 40px;
  height: 40px;
}

.cross-horizontal,
.cross-vertical {
  position: absolute;
  background: #d1fae5;
  border-radius: 4px;
}

.cross-horizontal {
  top: 13px;
  left: 0;
  width: 40px;
  height: 14px;
}

.cross-vertical {
  left: 13px;
  top: 0;
  width: 14px;
  height: 40px;
}

.controller-buttons {
  position: absolute;
  right: 28px;
  top: 45px;
  width: 48px;
  height: 45px;
}

.controller-button {
  position: absolute;
  width: 25px;
  height: 25px;

  display: grid;
  place-items: center;

  border-radius: 50%;
  color: #052e16;
  font-size: 10px;
  font-weight: 1000;

  box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.45);
}

.button-a {
  top: 0;
  right: 0;
  background: #facc15;
}

.button-b {
  bottom: 0;
  left: 0;
  background: #fb7185;
}

.floating-star {
  position: absolute;
  z-index: 2;
  color: #facc15;
  text-shadow: 0 0 15px rgba(250, 204, 21, 0.5);
}

.star-one {
  top: 18px;
  left: 12%;
  font-size: 26px;
}

.star-two {
  top: 30px;
  right: 11%;
  font-size: 35px;
}

.star-three {
  bottom: 36px;
  left: 17%;
  font-size: 20px;
}

.art-caption {
  position: absolute;
  bottom: 0;
  right: 5px;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;

  transform: rotate(-5deg);
}

.art-caption span {
  color: #facc15;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 3px;
}

.art-caption strong {
  color: white;
  font-size: 15px;
  font-weight: 1000;
  letter-spacing: 1px;
}

/* SECTION HEADINGS */

.balance-section,
.games-section {
  margin-top: 38px;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;

  margin-bottom: 19px;
}

.eyebrow {
  display: block;
  margin-bottom: 6px;

  color: var(--dash-green-light);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.7px;
}

.section-heading h2 {
  margin: 0;
  color: var(--app-text, #f4fff6);

  font-size: clamp(22px, 3vw, 29px);
  font-weight: 900;
  letter-spacing: -0.7px;
}

.section-subtitle {
  margin: 7px 0 0;
  color: var(--app-muted, #91a99a);
  font-size: 13px;
  line-height: 1.6;
}

.text-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  padding: 8px 0;
  border: 0;

  background: transparent;
  color: var(--dash-green-light);

  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
  cursor: pointer;
}

.text-link span {
  font-size: 17px;
  transition: transform 0.2s ease;
}

.text-link:hover span {
  transform: translateX(4px);
}

/* WALLET CARDS */

.balance-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 17px;
}

.balance-card {
  min-width: 0;
  padding: 21px;

  border: 1px solid var(--app-border, #284431);
  border-radius: 19px;

  color: var(--app-text, #f4fff6);
  text-align: left;
  cursor: pointer;

  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.balance-card:hover {
  transform: translateY(-3px);
  border-color: rgba(74, 222, 128, 0.55);
  box-shadow: 0 13px 30px rgba(0, 0, 0, 0.12);
}

.coin-balance-card {
  background:
    radial-gradient(
      circle at 100% 0,
      rgba(250, 204, 21, 0.1),
      transparent 38%
    ),
    var(--app-card, #0d2115);
}

.dollar-balance-card {
  background:
    radial-gradient(
      circle at 100% 0,
      rgba(34, 197, 94, 0.13),
      transparent 38%
    ),
    var(--app-card, #0d2115);
}

.balance-card-top {
  display: flex;
  align-items: center;
  gap: 11px;
}

.balance-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;

  display: grid;
  place-items: center;

  border-radius: 13px;
  font-size: 22px;
  font-weight: 1000;
}

.coin-icon {
  border: 2px solid #fde68a;
  border-radius: 50%;

  background: linear-gradient(145deg, #fde047, #d97706);
  color: #713f12;

  box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.2);
}

.dollar-icon {
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid rgba(74, 222, 128, 0.3);
  color: #4ade80;
}

.balance-label {
  min-width: 0;
  color: var(--app-muted, #91a99a);

  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.2px;
}

.balance-open {
  margin-left: auto;
  color: var(--app-muted, #91a99a);
  font-size: 18px;
}

.balance-number {
  margin-top: 23px;

  color: #fef3c7;
  font-size: clamp(28px, 4vw, 39px);
  font-weight: 950;
  line-height: 1.2;
  letter-spacing: -1.2px;

  overflow-wrap: anywhere;
}

.dollar-number {
  color: #4ade80;
}

.balance-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  margin-top: 17px;
  padding-top: 15px;

  border-top: 1px solid var(--app-border, #284431);

  color: var(--app-muted, #91a99a);
  font-size: 11px;
}

.balance-pill {
  flex-shrink: 0;
  padding: 5px 8px;

  border-radius: 6px;
  background: rgba(250, 204, 21, 0.1);
  color: #fde68a;

  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.8px;
}

.dollar-pill {
  background: rgba(34, 197, 94, 0.12);
  color: #86efac;
}

.conversion-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  margin: 13px 2px 0;

  color: var(--app-muted, #91a99a);
  font-size: 11px;
  line-height: 1.7;
}

.conversion-note > span {
  color: var(--dash-green-light);
  font-size: 14px;
}

.loading-shimmer {
  display: inline-block;
  width: 125px;
  height: 34px;
  border-radius: 7px;

  background: linear-gradient(
    90deg,
    rgba(128, 128, 128, 0.1),
    rgba(128, 128, 128, 0.24),
    rgba(128, 128, 128, 0.1)
  );

  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.dashboard-error {
  display: flex;
  align-items: center;
  gap: 10px;

  margin-bottom: 14px;
  padding: 12px 14px;

  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 11px;

  background: rgba(127, 29, 29, 0.16);
  color: #fca5a5;

  font-size: 12px;
}

.dashboard-error button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 800;
  cursor: pointer;
}

/* GAME GRID */

.games-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 19px;
}

.game-card {
  min-width: 0;
  overflow: hidden;

  padding: 0;

  border: 1px solid var(--app-border, #284431);
  border-radius: 19px;

  background: var(--app-card, #0d2115);
  color: var(--app-text, #f4fff6);

  text-align: left;
  cursor: pointer;

  transition:
    transform 0.23s ease,
    border-color 0.23s ease,
    box-shadow 0.23s ease;
}

.game-card:hover {
  transform: translateY(-5px);
  border-color: rgba(74, 222, 128, 0.5);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.17);
}

.game-card-art {
  position: relative;
  overflow: hidden;

  height: 220px;
  min-height: 190px;

  display: flex;
  align-items: center;
  justify-content: center;
}

.art-tag {
  position: absolute;
  top: 13px;
  left: 13px;
  z-index: 5;

  padding: 6px 9px;

  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 7px;

  background: rgba(0, 0, 0, 0.22);
  color: white;

  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1px;

  backdrop-filter: blur(8px);
}

/* WHOT ART */

.whot-art {
  background:
    radial-gradient(circle at 50% 48%, #d6a53c, transparent 43%),
    linear-gradient(135deg, #3b0a1a, #801b28 55%, #2a0815);
}

.art-light {
  position: absolute;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  filter: blur(30px);
}

.light-one {
  left: 0;
  bottom: -70px;
  background: rgba(239, 68, 68, 0.4);
}

.light-two {
  right: 0;
  top: -80px;
  background: rgba(250, 204, 21, 0.24);
}

.whot-cards {
  position: relative;
  width: 220px;
  height: 150px;
}

.playing-card {
  position: absolute;
  width: 83px;
  height: 118px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  border: 3px solid #fff9df;
  border-radius: 10px;

  background: #fff9df;
  color: #991b1b;

  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.35);
}

.card-back {
  left: 15px;
  top: 19px;

  border-color: #facc15;
  background: repeating-linear-gradient(
    45deg,
    #b91c1c,
    #b91c1c 6px,
    #7f1d1d 6px,
    #7f1d1d 12px
  );

  transform: rotate(-22deg);
}

.card-back-pattern {
  width: 42px;
  height: 42px;

  display: grid;
  place-items: center;

  border: 2px solid #facc15;
  border-radius: 8px;

  color: #facc15;
  font-size: 24px;
}

.card-middle {
  left: 68px;
  top: 6px;
  transform: rotate(-4deg);
}

.card-middle .card-symbol {
  font-size: 37px;
  color: #dc2626;
}

.card-middle strong {
  font-size: 20px;
}

.card-front {
  right: 8px;
  top: 16px;

  border-color: #fef3c7;
  background: linear-gradient(145deg, #fffdf4, #fef3c7);

  transform: rotate(17deg);
}

.card-front strong {
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -0.6px;
}

.card-top-symbol,
.card-bottom-symbol {
  color: #b91c1c;
  font-size: 17px;
}

/* MINES ART */

.mines-art {
  background:
    radial-gradient(circle at center, #193b56, transparent 65%),
    linear-gradient(135deg, #071827, #102c45 55%, #071827);
}

.mine-glow {
  position: absolute;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.15);
  filter: blur(35px);
}

.mine-grid {
  position: relative;
  width: 162px;
  height: 162px;

  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;

  transform: rotate(-5deg);
}

.mine-grid span {
  display: grid;
  place-items: center;

  border: 1px solid rgba(125, 211, 252, 0.35);
  border-radius: 10px;

  background: linear-gradient(145deg, #1e4c69, #10344e);

  color: #7dd3fc;
  font-size: 25px;

  box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.06);
}

.mine-grid .mine-center {
  background: linear-gradient(145deg, #f97316, #c2410c);
  border-color: #fdba74;
  color: #fff7ed;
  font-size: 36px;

  box-shadow: 0 0 25px rgba(249, 115, 22, 0.35);
}

.mine-badge {
  position: absolute;
  right: 14px;
  bottom: 15px;

  color: #bae6fd;
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: 2px;
}

/* SNAKE & LADDER ART */

.snake-art {
  background:
    radial-gradient(circle