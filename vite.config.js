import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT || 5173);

export default defineConfig({
  base: "/",
  plugins: [react()],
  server: { port, strictPort: true, host: "0.0.0.0", allowedHosts: true },
  preview: { port, strictPort: true, host: "0.0.0.0", allowedHosts: true },
  build: { outDir: "dist", sourcemap: false },
});
