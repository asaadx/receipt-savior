import { createApp } from "./app.js";
import { config } from "./config.js";

// Loopback keeps the API off the LAN; Vite proxies to it from this machine.
const HOST = "127.0.0.1";

const server = createApp().listen(config.PORT, HOST);

// Express fires the listen callback even when the bind failed (address() null
// inside it), so readiness comes from the event instead.
server.on("listening", () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.PORT;
  console.log(`API listening on http://${HOST}:${port}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${config.PORT} is already in use by another process.\n` +
        `Set PORT in .env to a free port, then restart.`
    );
    process.exit(1);
  }
  throw err;
});

const SHUTDOWN_GRACE_MS = 10_000;

let shuttingDown = false;

function shutdown(signal: string) {
  // A second Ctrl-C must not restart the sequence.
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down.`);

  // Backstop for a close() that never completes. Unref'd so it can't hold the
  // process open.
  const forceExit = setTimeout(() => {
    console.error(`Shutdown exceeded ${SHUTDOWN_GRACE_MS}ms; forcing exit.`);
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      console.error("Error during shutdown:", err);
      process.exitCode = 1;
    }

    // tsx's loader keeps a handle open, so exit explicitly. The empty write's
    // callback flushes first: process.exit() drops pending stdout writes.
    process.stdout.write("", () => process.exit(process.exitCode ?? 0));
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(signal));
}
