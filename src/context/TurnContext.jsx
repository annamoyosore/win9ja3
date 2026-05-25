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

  // 🔴 notification count
  const [turnAlerts, setTurnAlerts] = useState(0);

  // prevent repeated sounds
  const notified = useRef({});

  // 🔊 SOUND
  function playTurnSound() {
    try {
      const audio = new Audio("/turn.mp3");

      audio.volume = 1;

      audio.play().catch(() => {});
    } catch {}
  }

  useEffect(() => {

    let unsubscribe;

    async function init() {

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

          if (!game.players?.includes(user.$id)) {
            return;
          }

          // 🎯 YOUR TURN
          if (
            game.turn === user.$id &&
            game.status !== "finished"
          ) {

            // prevent repeat spam
            if (notified.current[game.$id]) {
              return;
            }

            notified.current[game.$id] = true;

            // 🔴 RED SIGNAL
            setTurnAlerts(prev => prev + 1);

            // 🔊 SOUND
            playTurnSound();

            // 📳 VIBRATE
            if (navigator.vibrate) {
              navigator.vibrate([300, 120, 300]);
            }

            // 🔔 NOTIFICATION
            if (
              Notification.permission === "granted"
            ) {
              new Notification("🎮 WIN9JA", {
                body: "It's your turn!",
                icon: "/icon192.png",
                requireInteraction: true
              });
            }

          } else {
            notified.current[game.$id] = false;
          }
        }
      );
    }

    init();

    return () => {
      if (unsubscribe) unsubscribe();
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