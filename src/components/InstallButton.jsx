import usePWAInstall from "../hooks/usePWAInstall";
import { useEffect, useState } from "react";

export default function InstallButton() {
  const { isInstallable, installApp } = usePWAInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstallable) {
      setVisible(true);
    }
  }, [isInstallable]);

  if (!visible) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.text}>📲 Install Win9ja App</div>

      <div style={styles.actions}>
        <button style={styles.btn} onClick={installApp}>
          Install
        </button>

        <button
          style={styles.close}
          onClick={() => setVisible(false)}
        >
          ✕
        </button>
      </div>
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
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 0 15px rgba(0,0,0,0.6)",
    zIndex: 99999,
    border: "1px solid rgba(255,255,255,0.1)"
  },

  text: {
    fontSize: 13,
    fontWeight: "500"
  },

  actions: {
    display: "flex",
    gap: 8,
    alignItems: "center"
  },

  btn: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer"
  },

  close: {
    background: "transparent",
    color: "#fff",
    border: "none",
    fontSize: 16,
    cursor: "pointer"
  }
};