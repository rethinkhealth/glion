#!/usr/bin/env node
// Simulates a hung close: emits ready, ignores SIGTERM.
const emit = (e) =>
  process.stdout.write(
    `${JSON.stringify({ ...e, ts: new Date().toISOString() })}\n`
  );

emit({ pid: process.pid, port: 2575, t: "ready", tls: false });

process.on("SIGTERM", () => {
  /* deliberately do nothing — force the supervisor to SIGKILL */
});

setInterval(() => {
  /* keep alive */
}, 1000);
