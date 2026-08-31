import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.win9jalife.app",
  appName: "Win9jaLife",
  webDir: "dist",
  bundledWebRuntime: false,
  server: { androidScheme: "https" },
};

export default config;
