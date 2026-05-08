import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// =========================
// 📲 PWA INSTALL PROMPT STATE
// =========================
window.deferredPrompt = null;

// =========================
// 🧠 SERVICE WORKER REGISTER
// =========================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("✅ Service Worker registered:", reg.scope);
      })
      .catch((err) => {
        console.log("❌ Service Worker failed:", err);
      });
  });
}

// =========================
// 📲 CAPTURE INSTALL EVENT
// =========================
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();

  // store event globally
  window.deferredPrompt = e;

  console.log("📲 Install prompt captured");
});

// =========================
// 🚀 RENDER APP
// =========================
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);