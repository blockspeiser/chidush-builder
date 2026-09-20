import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// All backend traffic goes to the API server (see server/index.ts), which
// in production also serves this built bundle.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: false },
    },
  },
});
