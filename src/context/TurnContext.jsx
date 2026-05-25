import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";

import {
  account,
  databases,
  DATABASE_ID
} from "../lib/appwrite";

const GAME_COLLECTION = "games";

const TurnContext = createContext();

export function TurnProvider({ children }) {

  // 🔴 red notification counter
  const [turnAlerts, setTurnAlerts] = useState(0);

  // prevent duplicate alerts per game
  const notified = useRef({});

  // store reminder intervals per game
  const reminderIntervals = useRef({});

  // =========================
  // 🗣️ VOICE ALERT
  // =========================
  function speakTurnReminder() {
    try {
      window.speechSynthesis.cancel();

      const speech = new SpeechSynthesisUtterance("It is your turn");

      speech.rate = 0.9;
      speech.pitch = 1.4;
      speech.volume = 1;

      const voices = window.speechSynthesis.getVoices();

      const preferredVoice = voices.find(v =>
        v.name.toLowerCase().includes("google") ||
        v.name.toLowerCase().includes("female")
      );

      if (preferredVoice) speech.voice = preferredVoice;

      window.speechSynthesis.speak(speech);

    } catch (err) {
      console.log("speech failed");
    }
  }

  useEffect(() => {

    let unsubscribe;

    async function init() {

      try {

        const user = await account.get();

        // request notification permission once
        if ("Notification" in window) {
          await Notification.requestPermission();
        }

        // =========================
        // REALTIME LISTENER
        // =========================
        unsubscribe = databases.client.subscribe(
          `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents`,
          (response) => {

            const game = response.payload;
            if (!game) return;

            if (!game.players?.includes(user.$id)) return;

            // =========================
            // 🎯 YOUR TURN
            // =========================
            if (
              game.turn === user.$id &&
              game.status !== "finished"
            ) {

              // prevent duplicate interval
              if (reminderIntervals.current[game.$id]) {
                return;
              }

              if (!notified.current[game.$id]) {

                notified.current[game.$id] = true;

                // 🔴 RED SIGNAL
                setTurnAlerts(prev => prev + 1);

                // 🔊 VOICE
                speakTurnReminder();

                // 📳 VIBRATION
                if (navigator.vibrate) {
                  navigator.vibrate([300, 120, 300]);
                }

                // 🔔 NOTIFICATION
                if (
                  "Notification" in window &&
                  Notification.permission === "granted"
                ) {
                  new Notification("🎮 WIN9JA", {
                    body: "It is your turn!",
                    icon: "/icon192.png",
                    requireInteraction: true
                  });
                }

                // 🚀 SERVICE WORKER PUSH (PWA STYLE)
                if (navigator.serviceWorker?.controller) {
                  navigator.serviceWorker.controller.postMessage({
                    type: "TURN_ALERT",
                    body: "It is your turn to play!"
                  });
                }
              }

              // =========================
              // ⏰ REPEAT EVERY 2 HOURS
              // =========================
              reminderIntervals.current[game.$id] =
                setInterval(() => {

                  speakTurnReminder();

                  if (navigator.vibrate) {
                    navigator.vibrate([200, 100, 200]);
                  }

                  if (
                    "Notification" in window &&
                    Notification.permission === "granted"
                  ) {
                    new Notification("🎮 WIN9JA", {
                      body: "Opponent is waiting for you",
                      icon: "/icon192.png"
                    });
                  }

                  if (navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({
                      type: "TURN_ALERT",
                      body: "Opponent is waiting for your move!"
                    });
                  }

                }, 2 * 60 * 60 * 1000);

            } else {

              // =========================
              // ✅ TURN ENDED
              // =========================

              notified.current[game.$id] = false;

              if (reminderIntervals.current[game.$id]) {
                clearInterval(reminderIntervals.current[game.$id]);
                delete reminderIntervals.current[game.$id];
              }
            }
          }
        );

      } catch (err) {
        console.log(err);
      }
    }

    init();

    return () => {

      if (unsubscribe) unsubscribe();

      // cleanup intervals
      Object.values(reminderIntervals.current)
        .forEach(clearInterval);
    };

  }, []);

  return (
    <TurnContext.Provider
      value={{
        turnAlerts,
        setTurnAlerts
      }}
    >
      {children}
    </TurnContext.Provider>
  );
}

export function useTurn() {
  return useContext(TurnContext);
}