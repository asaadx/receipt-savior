import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Keeps the frontend's fetch calls origin-relative, so no CORS handling and
    // no environment-specific API base URL in the client.
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
});
