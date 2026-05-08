import { useEffect, useRef, useState } from "react";

export default function usePWAInstall() {
  const deferredPromptRef = useRef(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e) => {
      // IMPORTANT: only prevent default when install is actually available
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

    if (!promptEvent) {
      console.log("📲 Install prompt not available yet");
      return;
    }

    try {
      promptEvent.prompt();

      const result = await promptEvent.userChoice;

      if (result.outcome === "accepted") {
        console.log("✅ App installed");
        setIsInstallable(false);
      } else {
        console.log("❌ User dismissed install");
      }
    } catch (err) {
      console.log("⚠️ Install failed:", err);
    }

    deferredPromptRef.current = null;
  };

  return { isInstallable, installApp };
}