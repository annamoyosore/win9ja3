import usePWAInstall from "../hooks/usePWAInstall";

export default function InstallButton() {
  const { isInstallable, installApp } = usePWAInstall();

  function handleInstall() {
    if (isInstallable) {
      installApp();
    } else {
      alert(
        "To install Win9ja:\n\nTap Chrome menu (⋮)\nThen tap 'Add to Home Screen'"
      );
    }
  }

  return (
    <div style={styles.banner}>
      <div style={styles.text}>
        📲 Install Win9ja App
      </div>

      <button
        style={styles.btn}
        onClick={handleInstall}
      >
        Install
      </button>
    </div>
  );
}

const styles = {
  banner: {
    position: "fixed",
    bottom: 15,
    left: "50%",
    transform: "translateX(-50%)",

    width: "92%",
    maxWidth: 420,

    background: "#111827",
    color: "#fff",

    padding: "12px 14px",
    borderRadius: 14,

    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",

    boxShadow: "0 0 15px rgba(0,0,0,0.6)",

    zIndex: 99999,

    border: "1px solid rgba(255,255,255,0.1)"
  },

  text: {
    fontSize: 13,
    fontWeight: "600"
  },

  btn: {
    background: "#16a34a",
    color: "#fff",

    border: "none",

    padding: "8px 14px",
    borderRadius: 10,

    fontWeight: "bold",
    cursor: "pointer"
  }
};