import { useEffect, useRef, useState } from "react";

export default function usePWAInstall() {
  const deferredPromptRef = useRef(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const installApp = async () => {
    const promptEvent = deferredPromptRef.current;

    if (!promptEvent) return;

    promptEvent.prompt();

    const result = await promptEvent.userChoice;

    if (result.outcome === "accepted") {
      setIsInstallable(false);
    }

    deferredPromptRef.current = null;
  };

  return { isInstallable, installApp };
}