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

  // 🔴 red badge counter
  const [turnAlerts, setTurnAlerts] = useState(0);

  // prevent duplicate alerts per game
  const notified = useRef({});

  // per-game turn state tracker
  const turnState = useRef({});

  // activity tracking
  const lastActivityRef = useRef(Date.now());

  // =========================
  // 🗣 VOICE ALERT
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

  // =========================
  // TRACK USER ACTIVITY
  // =========================
  useEffect(() => {

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("click", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("mousemove", updateActivity);
    window.addEventListener("touchstart", updateActivity);

    return () => {
      window.removeEventListener("click", updateActivity);
      window.removeEventListener("keydown", updateActivity);
      window.removeEventListener("mousemove", updateActivity);
      window.removeEventListener("touchstart", updateActivity);
    };

  }, []);

  // =========================
  // MAIN REALTIME LISTENER
  // =========================
  useEffect(() => {

    let unsubscribe;

    async function init() {

      try {

        const user = await account.get();

        if ("Notification" in window) {
          await Notification.requestPermission();
        }

        unsubscribe = databases.client.subscribe(
          `databases.${DATABASE_ID}.collections.${GAME_COLLECTION}.documents`,
          (response) => {

            const game = response.payload;
            if (!game) return;

            if (!game.players?.includes(user.$id)) return;

            // =========================
            // 🎯 YOUR TURN LOGIC
            // =========================
            if (
              game.turn === user.$id &&
              game.status !== "finished"
            ) {

              const now = Date.now();

              const state =
                turnState.current[game.$id] || {
                  firstAlertSent: false,
                  lastAlertTime: 0
                };

              const inactiveTime =
                now - lastActivityRef.current;

              const isFirstAlertTime =
                inactiveTime >= 3 * 60 * 1000;

              const isRepeatAlertTime =
                now - state.lastAlertTime >=
                2 * 60 * 60 * 1000;

              // =========================
              // FIRST ALERT (3 MIN RULE)
              // =========================
              if (!state.firstAlertSent && isFirstAlertTime) {

                triggerTurnAlert();

                turnState.current[game.$id] = {
                  firstAlertSent: true,
                  lastAlertTime: now
                };
              }

              // =========================
              // REPEAT ALERT (2 HOURS)
              // =========================
              else if (
                state.firstAlertSent &&
                isRepeatAlertTime
              ) {

                triggerTurnAlert();

                turnState.current[game.$id].lastAlertTime = now;
              }

            } else {

              // =========================
              // RESET WHEN TURN ENDS
              // =========================

              notified.current[game.$id] = false;
              delete turnState.current[game.$id];
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
    };

  }, []);

  // =========================
  // 🔥 ALERT FUNCTION
  // =========================
  function triggerTurnAlert() {

    setTurnAlerts(prev => prev + 1);

    speakTurnReminder();

    if (navigator.vibrate) {
      navigator.vibrate([300, 120, 300]);
    }

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

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "TURN_ALERT",
        body: "It is your turn to play!"
      });
    }
  }

  return (
    <TurnContext.Provider value={{ turnAlerts, setTurnAlerts }}>
      {children}
    </TurnContext.Provider>
  );
}

export function useTurn() {
  return useContext(TurnContext);
}