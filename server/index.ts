import { createApp } from "./app.js";
import { config } from "./config.js";

const server = createApp().listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

/**
 * Graceful shutdown: stop accepting connections and let in-flight requests
 * finish. Phase 4 closes the RabbitMQ channel here too — a consumer that dies
 * without closing its channel leaves unacked messages waiting on the broker's
 * heartbeat timeout instead of being redelivered immediately.
 */
const SHUTDOWN_GRACE_MS = 10_000;

let shuttingDown = false;

function shutdown(signal: string) {
  // A second Ctrl-C must not restart the sequence.
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down.`);

  // Backstop only, for a close() that never completes. Unref'd so it cannot
  // itself keep the process alive, and deliberately never cleared: the success
  // path exits explicitly below, so a pending timer is harmless.
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

    // Exits explicitly instead of waiting for the event loop to drain, because
    // in development tsx's module loader keeps a handle open and the process
    // would hang until the backstop above fires.
    //
    // The empty write's callback is what makes this safe: process.exit()
    // abandons pending async stdout writes, so exiting directly silently drops
    // these lines whenever stdout is a pipe or file rather than a TTY.
    process.stdout.write("", () => process.exit(process.exitCode ?? 0));
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(signal));
}
