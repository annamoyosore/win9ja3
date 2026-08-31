# Win9jaLife distribution

The existing React/Vite application remains under src/. The distribution setup wraps that app rather than replacing its Appwrite authentication, database access, games, wallet/payment flows, routing, notifications, or service worker.

## Installable web app

- public/manifest.json provides standalone display metadata and correctly sized PWA icons.
- The existing public/sw.js is registered by src/main.jsx.
- index.html includes mobile and Apple web-app metadata.

Build the production web app with: pnpm run build
The output is written to dist/.

## Android / Google Play

Capacitor uses the stable application ID com.win9jalife.app. The generated Android project is under android/ and targets SDK 35.

After any web change, refresh Android assets with: pnpm run cap:sync
Open Android Studio with: pnpm run cap:open:android

For a Play Console release, configure an app-signing key in Android Studio or the Play Console, then build a signed Android App Bundle from android/. Never commit signing keys or google-services.json.

## External release settings

Before publishing, register the production web hostname as an Appwrite Web platform origin and update payment-provider allowlists or redirect URLs. Existing browser/service-worker notifications are preserved; Android remote push notifications would require separate provider setup.
