import { useEffect, useState } from "react";

export default function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    function handler(e) {
      e.preventDefault(); // important
      setDeferredPrompt(e);
      setIsInstallable(true);
    }

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function installApp() {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt(); // show install popup

    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }

    return choice.outcome === "accepted";
  }

  return { isInstallable, installApp };
}