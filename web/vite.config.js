import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/Panels": "http://localhost:3001",
      "/inspections": "http://localhost:3001",
      "/devices": "http://localhost:3001",
      "/__routes": "http://localhost:3001",
      "/db-check": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
