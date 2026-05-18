import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves под /BET_System/ path. Локально под /.
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/BET_System/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
}));
