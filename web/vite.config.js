import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "inspectra-3.onrender.com",
      "inspectra-2.onrender.com",
      ".onrender.com"
    ],
  },
});
