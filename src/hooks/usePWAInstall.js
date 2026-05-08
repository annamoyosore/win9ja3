import { useEffect, useRef, useState } from "react";

export default function usePWAInstall() {
  const deferredPromptRef = useRef(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();

      // store event in ref (NOT state)
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

    if (!promptEvent) {
      console.log("📲 Install prompt not available");
      return;
    }

    promptEvent.prompt();

    const result = await promptEvent.userChoice;

    if (result.outcome === "accepted") {
      console.log("✅ App installed");
      setIsInstallable(false);
    } else {
      console.log("❌ User dismissed install");
    }

    deferredPromptRef.current = null;
  };

  return { isInstallable, installApp };
}