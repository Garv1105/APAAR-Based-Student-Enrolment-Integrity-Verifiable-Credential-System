import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API calls go to /v1/* and are proxied to the FastAPI backend, so no CORS in dev.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/v1": "http://127.0.0.1:8000", "/healthz": "http://127.0.0.1:8000" },
  },
});
