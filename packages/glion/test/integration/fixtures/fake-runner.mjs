#!/usr/bin/env node
// Simulates a healthy child: emits ready, responds to SIGTERM cleanly.
const emit = (e) =>
  process.stdout.write(
    `${JSON.stringify({ ...e, ts: new Date().toISOString() })}\n`
  );

emit({ pid: process.pid, port: 2575, t: "ready", tls: false });
emit({ id: 1, remote: "1.1.1.1:1000", t: "conn.open" });

process.on("SIGTERM", () => {
  emit({ t: "closing" });
  emit({ t: "closed" });
  process.exit(0);
});

// Keep alive
setInterval(() => {
  /* keep alive */
}, 1000);
