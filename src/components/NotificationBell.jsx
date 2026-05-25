import { useTurn } from "../context/TurnContext";

export default function NotificationBell() {

  const {
    turnAlerts,
    setTurnAlerts
  } = useTurn();

  // clear notifications
  function clearAlerts() {
    setTurnAlerts(0);
  }

  return (
    <div
      onClick={clearAlerts}
      style={{
        position: "fixed",
        top: 15,
        right: 15,
        zIndex: 9999,
        cursor: "pointer"
      }}
    >

      {/* 🔔 Bell */}
      <div
        style={{
          position: "relative",
          fontSize: 30
        }}
      >
        🔔

        {/* 🔴 RED SIGNAL */}
        {turnAlerts > 0 && (
          <div
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 22,
              height: 22,
              padding: "0 6px",
              borderRadius: 999,
              background: "red",
              color: "white",
              fontSize: 12,
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow:
                "0 0 12px rgba(255,0,0,0.9)",

              // blinking animation
              animation:
                "win9jaBlink 1s infinite"
            }}
          >
            {turnAlerts}
          </div>
        )}
      </div>

      {/* animation */}
      <style>
        {`
          @keyframes win9jaBlink {
            0% {
              transform: scale(1);
              opacity: 1;
            }

            50% {
              transform: scale(1.2);
              opacity: 0.7;
            }

            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
        `}
      </style>

    </div>
  );
}