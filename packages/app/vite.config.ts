import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri runs the dev server on a fixed port; on Android the device reaches it through TAURI_DEV_HOST.
const host = process.env["TAURI_DEV_HOST"];

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    ...(host ? { hmr: { protocol: "ws", host, port: 1421 } } : {}),
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
