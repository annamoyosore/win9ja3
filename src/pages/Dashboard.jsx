import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  Query,
} from "../lib/appwrite";

import { getWallet } from "../lib/wallet";

const ADMIN_USER_ID = "69ef9fe863a02a7490b4";

const SUPPORT_URL =
  "https://wa.me/18622726355?text=Hello%20Support,%20I%20need%20help%20with%20my%20account";

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
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

        // Load the user's naira wallet.
        try {
          const walletResponse = await databases.listDocuments(
            DATABASE_ID,
            WALLET_COLLECTION,
            [Query.equal("userId", currentUser.$id)]
          );

          if (!active) return;

          const userWallet = walletResponse.documents?.[0] || null;
          setWallet(userWallet);
        } catch (walletError) {
          console.error("Unable to load naira wallet:", walletError);
        }

        // Load the user's Win9ja Coins.
        try {
          const currentWallet = await getWallet(currentUser.$id);

          if (!active) return;

          setCoins(Number(currentWallet?.coins || 0));
        } catch (coinError) {
          console.error("Unable to load Win9ja Coins:", coinError);
          setCoins(0);
        }
      } catch (loadError) {
        console.error("Unable to load dashboard:", loadError);

        if (active) {
          setError("Unable to load your dashboard. Please sign in again.");
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

  function goWallet() {
    setMenuOpen(false);
    navigate("/wallet");
  }

  function goTo(path) {
    setMenuOpen(false);
    navigate(path);
  }

  async function handleLogout() {
    try {
      await account.deleteSession("current");
      navigate("/login");
    } catch (logoutError) {
      console.error("Logout failed:", logoutError);
      setError("Unable to log out. Please try again.");
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <p>Loading Win9ja Life...</p>
        </div>
      </main>
    );
  }

  if (error && !user) {
    return (
      <main style={styles.page}>
        <div style={styles.errorCard}>
          <p>{error}</p>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => navigate("/login")}
          >
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        {/* HEADER */}
        <header style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.brandLogo}>W</div>

            <div>
              <h1 style={styles.title}>Win9ja Life</h1>
              <p style={styles.subtitle}>Play • Earn • Enjoy</p>
            </div>
          </div>

          {/* MINI MENU BUTTON */}
          <div style={styles.menuWrapper}>
            <button
              type="button"
              style={{
                ...styles.menuButton,
                ...(menuOpen ? styles.menuButtonActive : {}),
              }}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen((previous) => !previous)}
            >
              <span style={styles.menuIcon}>
                {menuOpen ? "✕" : "☰"}
              </span>
              <span style={styles.menuButtonText}>
                {menuOpen ? "Close" : "Menu"}
              </span>
            </button>

            {/* DROPDOWN MENU */}
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu overlay"
                  style={styles.menuOverlay}
                  onClick={() => setMenuOpen(false)}
                />

                <nav style={styles.dropdownMenu} aria-label="Dashboard menu">
                  <div style={styles.menuHeading}>
                    <span>Quick Menu</span>
                    <span style={styles.menuHeadingIcon}>✦</span>
                  </div>

                  <button
                    type="button"
                    style={styles.menuItem}
                    onClick={goWallet}
                  >
                    <span style={styles.menuItemIcon}>👛</span>
                    <span style={styles.menuItemText}>
                      <strong>My Wallet</strong>
                      <small>Coins and balance</small>
                    </span>
                    <span style={styles.menuChevron}>›</span>
                  </button>

                  <button
                    type="button"
                    style={styles.menuItem}
                    onClick={() => goTo("/transactions")}
                  >
                    <span style={styles.menuItemIcon}>📄</span>
                    <span style={styles.menuItemText}>
                      <strong>Transactions</strong>
                      <small>View your activity</small>
                    </span>
                    <span style={styles.menuChevron}>›</span>
                  </button>

                  <a
                    href={SUPPORT_URL}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.menuLink}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span style={styles.menuItemIcon}>💬</span>
                    <span style={styles.menuItemText}>
                      <strong>Contact Support</strong>
                      <small>Get help on WhatsApp</small>
                    </span>
                    <span style={styles.menuChevron}>↗</span>
                  </a>

                  <button
                    type="button"
                    style={styles.menuItem}
                    onClick={() => goTo("/about")}
                  >
                    <span style={styles.menuItemIcon}>ℹ️</span>
                    <span style={styles.menuItemText}>
                      <strong>About Win9ja</strong>
                      <small>Learn about the platform</small>
                    </span>
                    <span style={styles.menuChevron}>›</span>
                  </button>

                  <button
                    type="button"
                    style={styles.menuItem}
                    onClick={() => goTo("/instructions")}
                  >
                    <span style={styles.menuItemIcon}>📘</span>
                    <span style={styles.menuItemText}>
                      <strong>Instructions</strong>
                      <small>How to play</small>
                    </span>
                    <span style={styles.menuChevron}>›</span>
                  </button>

                  {user?.$id === ADMIN_USER_ID && (
                    <button
                      type="button"
                      style={styles.menuItem}
                      onClick={() => goTo("/admin")}
                    >
                      <span style={styles.menuItemIcon}>🛡️</span>
                      <span style={styles.menuItemText}>
                        <strong>Admin Panel</strong>
                        <small>Manage the platform</small>
                      </span>
                      <span style={styles.menuChevron}>›</span>
                    </button>
                  )}

                  <div style={styles.menuDivider} />

                  <button
                    type="button"
                    style={styles.logoutMenuItem}
                    onClick={handleLogout}
                  >
                    <span style={styles.menuItemIcon}>🚪</span>
                    <span style={styles.menuItemText}>
                      <strong>Log Out</strong>
                      <small>Sign out of your account</small>
                    </span>
                    <span style={styles.menuChevron}>›</span>
                  </button>
                </nav>
              </>
            )}
          </div>
        </header>

        {error && <div style={styles.inlineError}>{error}</div>}

        {/* WELCOME */}
        <section style={styles.welcome}>
          <p style={styles.welcomeEyebrow}>YOUR GAMING SPACE</p>

          <h2 style={styles.welcomeTitle}>
            Welcome{user?.name ? `, ${user.name}` : " back"}!
          </h2>

          <p style={styles.welcomeText}>
            Ready to play and enjoy Win9ja Life?
          </p>
        </section>

        {/* BALANCE CARDS */}
        <section style={styles.balanceGrid}>
          {/* NAIRA WALLET */}
          <div style={styles.balanceCard}>
            <p style={styles.balanceLabel}>NAIRA WALLET</p>

            <p style={styles.nairaBalance}>
              ₦
              {Number(wallet?.balance || 0).toLocaleString("en-NG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>

            <button
              type="button"
              style={styles.walletButton}
              onClick={goWallet}
            >
              Open Wallet <span aria-hidden="true">→</span>
            </button>
          </div>

          {/* CLICKABLE WIN9JA COINS CARD */}
          <button
            type="button"
            onClick={goWallet}
            aria-label={`Your Win9ja Coins balance is ${coins.toLocaleString(
              "en-NG"
            )}. Tap to open your wallet.`}
            style={styles.clickableCoinCard}
          >
            <span style={styles.coinCardHeader}>
              <span style={styles.balanceLabel}>YOUR WIN9JA COINS</span>
              <span style={styles.coinArrow} aria-hidden="true">
                ↗
              </span>
            </span>

            <span style={styles.coinRow}>
              <CoinLogo size={38} />
              <span style={styles.coinBalance}>
                {coins.toLocaleString("en-NG")}
              </span>
            </span>

            <span style={styles.coinTapHint}>
              Tap to open wallet <span aria-hidden="true">→</span>
            </span>
          </button>
        </section>

        {/* GAMES */}
        <section style={styles.gamesSection}>
          <div style={styles.sectionHeading}>
            <div>
              <h2 style={styles.sectionTitle}>Choose Your Game</h2>
              <p style={styles.sectionSubtitle}>
                Pick a game and start playing.
              </p>
            </div>
            <span style={styles.gameHeadingIcon}>🎮</span>
          </div>

          <div style={styles.gameGrid}>
            <GameCard
              icon="🃏"
              title="WHOT"
              description="Play the classic card game."
              onClick={() => goTo("/whot")}
            />

            <GameCard
              icon="🎲"
              title="Snake & Ladder"
              description="Roll the dice and climb."
              onClick={() => goTo("/snake-ladder")}
            />

            <GameCard
              icon="🏆"
              title="Jackpot"
              description="Try your luck and play."
              onClick={() => goTo("/jackpot")}
            />

            <GameCard
              icon="💣"
              title="Mines"
              description="Test your strategy."
              onClick={() => goTo("/mines")}
            />
          </div>
        </section>

        {/* FOOTER */}
        <footer style={styles.footer}>
          <div style={styles.footerLogo}>W</div>
          <p>Win9ja Life</p>
          <span>Play • Earn • Enjoy</span>
        </footer>
      </div>

      {/* ARROW ANIMATION */}
      <style>{`
        @keyframes coinArrowBounce {
          0%, 100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(2px, -2px);
          }
        }

        @keyframes dashboardSpin {
          to {
            transform: rotate(360deg);
          }
        }

        .win9ja-game-card:hover {
          transform: translateY(-3px);
          border-color: var(--app-coin-text, #facc15);
        }

        .win9ja-coin-card:hover {
          transform: translateY(-2px);
          border-color: var(--app-coin-text, #facc15);
        }

        .win9ja-menu-item:hover {
          background: var(--app-secondary, #263951);
        }

        button:focus-visible,
        a:focus-visible {
          outline: 2px solid #facc15;
          outline-offset: 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          .win9ja-coin-arrow {
            animation: none !important;
          }

          .win9ja-game-card,
          .win9ja-coin-card {
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}

/* WIN9JA COIN LOGO */
function CoinLogo({ size = 38 }) {
  return (
    <span
      style={{
        ...styles.coinLogo,
        width: size,
        height: size,
        minWidth: size,
        fontSize: size * 0.48,
      }}
      aria-hidden="true"
    >
      W
    </span>
  );
}

/* GAME CARD */
function GameCard({ icon, title, description, onClick }) {
  return (
    <button
      type="button"
      className="win9ja-game-card"
      onClick={onClick}
      style={styles.gameCard}
    >
      <span style={styles.gameIcon}>{icon}</span>
      <span style={styles.gameTitle}>{title}</span>
      <span style={styles.gameDescription}>{description}</span>
      <span style={styles.gameAction}>
        Play Now <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--app-bg, #07111f)",
    color: "var(--app-text, #ffffff)",
    padding: "20px 14px 32px",
    boxSizing: "border-box",
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  container: {
    width: "100%",
    maxWidth: "900px",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    position: "relative",
    zIndex: 20,
    marginBottom: "28px",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },

  brandLogo: {
    width: "44px",
    height: "44px",
    minWidth: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #facc15, #f59e0b)",
    color: "#172033",
    fontSize: "24px",
    fontWeight: 900,
    boxShadow: "0 5px 18px rgba(250, 204, 21, 0.18)",
  },

  title: {
    margin: 0,
    fontSize: "20px",
    lineHeight: 1.2,
    fontWeight: 850,
    color: "var(--app-text, #ffffff)",
  },

  subtitle: {
    margin: "4px 0 0",
    fontSize: "12px",
    color: "var(--app-muted, #9aabc0)",
  },

  menuWrapper: {
    position: "relative",
    zIndex: 30,
    flexShrink: 0,
  },

  menuButton: {
    position: "relative",
    zIndex: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    minHeight: "42px",
    padding: "9px 13px",
    borderRadius: "12px",
    border: "1px solid var(--app-border, #263951)",
    background: "var(--app-card, #101e31)",
    color: "var(--app-text, #ffffff)",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 750,
    fontFamily: "inherit",
  },

  menuButtonActive: {
    borderColor: "var(--app-coin-text, #facc15)",
  },

  menuIcon: {
    fontSize: "19px",
    lineHeight: 1,
  },

  menuButtonText: {
    fontSize: "12px",
  },

  menuOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 29,
    width: "100%",
    height: "100%",
    border: "none",
    padding: 0,
    background: "rgba(0, 0, 0, 0.28)",
    cursor: "default",
  },

  dropdownMenu: {
    position: "absolute",
    top: "calc(100% + 10px)",
    right: 0,
    zIndex: 31,
    width: "min(310px, calc(100vw - 28px))",
    padding: "10px",
    borderRadius: "17px",
    border: "1px solid var(--app-border, #263951)",
    background: "var(--app-card, #101e31)",
    color: "var(--app-text, #ffffff)",
    boxShadow: "0 18px 45px rgba(0, 0, 0, 0.35)",
    boxSizing: "border-box",
    animation: "dashboardMenuIn 0.16s ease-out",
  },

  menuHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "9px 10px 12px",
    fontSize: "13px",
    fontWeight: 850,
    color: "var(--app-text, #ffffff)",
  },

  menuHeadingIcon: {
    color: "var(--app-coin-text, #facc15)",
    fontSize: "18px",
  },

  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    width: "100%",
    padding: "11px 10px",
    border: "none",
    borderRadius: "11px",
    background: "transparent",
    color: "var(--app-text, #ffffff)",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    marginBottom: "2px",
  },

  menuLink: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    width: "100%",
    padding: "11px 10px",
    borderRadius: "11px",
    color: "var(--app-text, #ffffff)",
    textDecoration: "none",
    boxSizing: "border-box",
    marginBottom: "2px",
  },

  menuItemIcon: {
    width: "34px",
    height: "34px",
    minWidth: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    background: "var(--app-secondary, #263951)",
    fontSize: "17px",
  },

  menuItemText: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    flex: 1,
    minWidth: 0,
  },

  menuChevron: {
    fontSize: "22px",
    color: "var(--app-muted, #9aabc0)",
  },

  menuDivider: {
    height: "1px",
    margin: "7px 6px",
    background: "var(--app-border, #263951)",
  },

  logoutMenuItem: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    width: "100%",
    padding: "11px 10px",
    border: "none",
    borderRadius: "11px",
    background: "transparent",
    color: "#f87171",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  welcome: {
    padding: "7px 2px 23px",
  },

  welcomeEyebrow: {
    margin: "0 0 8px",
    color: "var(--app-muted, #9aabc0)",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "1.6px",
  },

  welcomeTitle: {
    margin: 0,
    fontSize: "clamp(24px, 5vw, 34px)",
    lineHeight: 1.2,
    fontWeight: 900,
    color: "var(--app-text, #ffffff)",
    overflowWrap: "anywhere",
  },

  welcomeText: {
    margin: "9px 0 0",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "var(--app-muted, #9aabc0)",
  },

  balanceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))",
    gap: "14px",
    marginBottom: "35px",
  },

  balanceCard: {
    minWidth: 0,
    padding: "18px",
    borderRadius: "16px",
    background: "var(--app-card, #101e31)",
    border: "1px solid var(--app-border, #263951)",
    boxSizing: "border-box",
  },

  balanceLabel: {
    display: "block",
    margin: 0,
    fontSize: "10px",
    lineHeight: 1.5,
    fontWeight: 850,
    letterSpacing: "1.1px",
    color: "var(--app-muted, #9aabc0)",
  },

  nairaBalance: {
    margin: "15px 0 18px",
    fontSize: "clamp(25px, 5vw, 34px)",
    lineHeight: 1.2,
    fontWeight: 900,
    letterSpacing: "-0.7px",
    color: "var(--app-text, #ffffff)",
    overflowWrap: "anywhere",
  },

  walletButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    width: "100%",
    padding: "11px 13px",
    border: "1px solid var(--app-border, #263951)",
    borderRadius: "10px",
    background: "var(--app-secondary, #263951)",
    color: "var(--app-text, #ffffff)",
    fontSize: "12px",
    fontWeight: 750,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  clickableCoinCard: {
    display: "block",
    width: "100%",
    minWidth: 0,
    padding: "18px",
    borderRadius: "16px",
    background: "var(--app-card, #101e31)",
    border: "1px solid var(--app-border, #263951)",
    boxSizing: "border-box",
    textAlign: "left",
    color: "var(--app-text, #ffffff)",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "transform 0.2s ease, border-color 0.2s ease",
  },

  coinCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  },

  coinArrow: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    minWidth: "28px",
    borderRadius: "50%",
    background: "var(--app-secondary, #263951)",
    color: "var(--app-coin-text, #facc15)",
    fontSize: "20px",
    fontWeight: "bold",
    animation: "coinArrowBounce 1.2s ease-in-out infinite",
  },

  coinRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginTop: "15px",
  },

  coinLogo: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #fde047, #f59e0b)",
    border: "2px solid #fef3c7",
    boxShadow: "0 4px 14px rgba(245, 158, 11, 0.2)",
    color: "#713f12",
    fontWeight: 950,
    boxSizing: "border-box",
  },

  coinBalance: {
    fontSize: "clamp(27px, 5vw, 35px)",
    lineHeight: 1.2,
    fontWeight: 900,
    letterSpacing: "-0.6px",
    overflowWrap: "anywhere",
  },

  coinTapHint: {
    display: "block",
    marginTop: "13px",
    fontSize: "12px",
    color: "var(--app-muted, #9aabc0)",
  },

  gamesSection: {
    marginTop: "5px",
  },

  sectionHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "17px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 850,
    color: "var(--app-text, #ffffff)",
  },

  sectionSubtitle: {
    margin: "6px 0 0",
    fontSize: "12px",
    color: "var(--app-muted, #9aabc0)",
  },

  gameHeadingIcon: {
    fontSize: "26px",
  },

  gameGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
    gap: "13px",
  },

  gameCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    width: "100%",
    minHeight: "174px",
    padding: "17px",
    borderRadius: "15px",
    border: "1px solid var(--app-border, #263951)",
    background: "var(--app-card, #101e31)",
    color: "var(--app-text, #ffffff)",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "transform 0.2s ease, border-color 0.2s ease",
    boxSizing: "border-box",
  },

  gameIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "44px",
    borderRadius: "13px",
    background: "var(--app-secondary, #263951)",
    fontSize: "25px",
    marginBottom: "14px",
  },

  gameTitle: {
    display: "block",
    fontSize: "15px",
    fontWeight: 850,
    lineHeight: 1.4,
  },

  gameDescription: {
    display: "block",
    marginTop: "5px",
    fontSize: "12px",
    lineHeight: 1.5,
    color: "var(--app-muted, #9aabc0)",
  },

  gameAction: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    width: "100%",
    marginTop: "auto",
    paddingTop: "15px",
    fontSize: "12px",
    fontWeight: 800,
    color: "var(--app-coin-text, #facc15)",
  },

  footer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "5px",
    marginTop: "42px",
    paddingTop: "23px",
    borderTop: "1px solid var(--app-border, #263951)",
    color: "var(--app-muted, #9aabc0)",
    fontSize: "12px",
  },

  footerLogo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "30px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #facc15, #f59e0b)",
    color: "#172033",
    fontWeight: 950,
  },

  footerText: {
    margin: 0,
  },

  loading: {
    minHeight: "65vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "13px",
    color: "var(--app-muted, #9aabc0)",
    fontSize: "14px",
  },

  spinner: {
    width: "34px",
    height: "34px",
    border: "3px solid var(--app-border, #263951)",
    borderTopColor: "var(--app-coin-text, #facc15)",
    borderRadius: "50%",
    animation: "dashboardSpin 0.8s linear infinite",
  },

  errorCard: {
    maxWidth: "420px",
    margin: "15vh auto",
    padding: "24px",
    borderRadius: "16px",
    background: "var(--app-card, #101e31)",
    border: "1px solid var(--app-border, #263951)",
    textAlign: "center",
  },

  primaryButton: {
    padding: "11px 16px",
    border: "none",
    borderRadius: "10px",
    background: "#facc15",
    color: "#172033",
    fontWeight: 850,
    cursor: "pointer",
  },

  inlineError: {
    padding: "12px 14px",
    marginBottom: "16px",
    border: "1px solid rgba(248, 113, 113, 0.35)",
    borderRadius: "10px",
    background: "rgba(248, 113, 113, 0.08)",
    color: "#fca5a5",
    fontSize: "13px",
  },
};