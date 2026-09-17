import { createApp } from "./app.js";
import { config } from "./config.js";

/**
 * Binds loopback rather than the wildcard address, which keeps the API off the
 * LAN. Vite proxies to it from this same machine, so phone testing over
 * `vite --host` still reaches it through the dev server.
 *
 * This is deliberately not a collision guard. The kernel refuses an
 * overlapping bind in either direction -- wildcard over a loopback holder and
 * loopback over a wildcard holder both raise EADDRINUSE -- so the bind address
 * has no bearing on detecting a taken port. That is the job of the `listening`
 * event and the error handler below.
 */
const HOST = "127.0.0.1";

const server = createApp().listen(config.PORT, HOST);

/**
 * Reports readiness from the `listening` event rather than the callback that
 * `app.listen()` accepts.
 *
 * Express invokes that callback even when the bind failed: inside it
 * `server.address()` is null and `server.listening` is false. Verified against
 * express 5.2.1; a plain `net.Server` does not behave this way. Trusting it
 * printed "API listening on http://localhost:3000" while the port in fact
 * belonged to VS Code's Live Preview, which answered this API's requests with
 * files from an unrelated project. The `listening` event fires only on a real
 * bind, and taking the port from `address()` means the log reports what was
 * actually acquired.
 */
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
