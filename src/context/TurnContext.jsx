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

  // 🔴 red notification count
  const [turnAlerts, setTurnAlerts] = useState(0);

  // prevent duplicate notifications
  const notified = useRef({});

  // reminder intervals
  const reminderIntervals = useRef({});

  // =========================
  // 🗣️ TALKING TURN VOICE
  // =========================
  function speakTurnReminder() {

    try {

      window.speechSynthesis.cancel();

      const speech =
        new SpeechSynthesisUtterance(
          "It is your turn"
        );

      // talking style
      speech.rate = 0.9;
      speech.pitch = 1.4;
      speech.volume = 1;

      const voices =
        window.speechSynthesis.getVoices();

      // try to find better voice
      const preferredVoice = voices.find(v =>
        v.name.toLowerCase().includes("google") ||
        v.name.toLowerCase().includes("female")
      );

      if (preferredVoice) {
        speech.voice = preferredVoice;
      }

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

        // notification permission
        if ("Notification" in window) {
          await Notification.requestPermission();
        }

        // realtime listener
        unsubscribe = databases.client.subscribe(
          `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents`,
          (response) => {

            const game = response.payload;

            if (!game) return;

            // not part of this game
            if (!game.players?.includes(user.$id)) {
              return;
            }

            // =========================
            // 🎯 YOUR TURN
            // =========================
            if (
              game.turn === user.$id &&
              game.status !== "finished"
            ) {

              // already reminding
              if (
                reminderIntervals.current[game.$id]
              ) {
                return;
              }

              // prevent spam
              if (!notified.current[game.$id]) {

                notified.current[game.$id] = true;

                // 🔴 RED SIGNAL
                setTurnAlerts(prev => prev + 1);

                // 🔊 TALK
                speakTurnReminder();

                // 📳 vibrate
                if (navigator.vibrate) {
                  navigator.vibrate([300, 120, 300]);
                }

                // 🔔 browser notification
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
              }

              // =========================
              // ⏰ REPEAT EVERY 2 HOURS
              // =========================
              reminderIntervals.current[game.$id] =
                setInterval(() => {

                  speakTurnReminder();

                  if (navigator.vibrate) {
                    navigator.vibrate([
                      200,
                      100,
                      200
                    ]);
                  }

                  if (
                    "Notification" in window &&
                    Notification.permission === "granted"
                  ) {
                    new Notification(
                      "🎮 WIN9JA",
                      {
                        body:
                          "Opponent is waiting for you",
                        icon: "/icon192.png"
                      }
                    );
                  }

                }, 2 * 60 * 60 * 1000);

            } else {

              // =========================
              // ✅ PLAYER PLAYED
              // =========================

              notified.current[game.$id] = false;

              if (
                reminderIntervals.current[game.$id]
              ) {

                clearInterval(
                  reminderIntervals.current[
                    game.$id
                  ]
                );

                delete reminderIntervals.current[
                  game.$id
                ];
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

      // unsubscribe realtime
      if (unsubscribe) {
        unsubscribe();
      }

      // clear all intervals
      Object.values(
        reminderIntervals.current
      ).forEach(clearInterval);
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