#!/usr/bin/env node
// Simulates a runtime crash: emits ready, then exits 1 after 50ms.
const emit = (e) =>
  process.stdout.write(
    `${JSON.stringify({ ...e, ts: new Date().toISOString() })}\n`
  );

emit({ pid: process.pid, port: 2575, t: "ready", tls: false });

setTimeout(() => {
  process.exit(1);
}, 50);
