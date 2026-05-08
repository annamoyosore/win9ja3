import usePWAInstall from "../hooks/usePWAInstall";

export default function InstallButton() {
  const { isInstallable, installApp } = usePWAInstall();

  if (!isInstallable) return null;

  return (
    <button
      onClick={installApp}
      style={{
        padding: "10px 14px",
        background: "#16a34a",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontWeight: "bold",
        cursor: "pointer"
      }}
    >
      📲 Install App
    </button>
  );
}