import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Keeps frontend fetches origin-relative: no CORS, no API base URL.
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
});
