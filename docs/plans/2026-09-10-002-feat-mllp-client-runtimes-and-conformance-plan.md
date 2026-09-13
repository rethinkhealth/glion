# @glion/mllp-client — runtime adapters and conformance testing plan

**Date**: 2026-09-10
**Status**: In progress; D1–D6 resolved 2026-09-10, steps 1–3 implemented on this branch
**Scope**: Which runtimes `@glion/mllp-client` ships adapters for, which it supports by proof alone, and a conformance-style test strategy that runs one specification of socket and client behaviour unchanged on every runtime.

## 0. What was measured

All measurements were taken on 2026-09-10 in this worktree (`main` at 9d60f965e), against the built `dist/` of the client and its workspace dependencies. Runtimes were installed from npm into a scratch directory; nothing was added to the repository.

| Check                                                                                                                       | Runtime                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node builtins anywhere in the client core or its `@glion/*` dependency graph                                                | —                                             | None. Only `src/runtime/node.ts` imports `node:net` and `node:stream`.                                                                                                                                                                                                                                                                                                                                                                   |
| `nodeSocket` end to end from `dist/`: connect, two sends on one connection, `close()`                                       | Bun 1.4.2                                     | Passes. `AA`, `AA`, close in 1 ms.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Same                                                                                                                        | Deno 2.9.6 (`node:net` compat)                | Passes.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The full vitest suite, 110 tests, with the worker runtime verified in-process via `process.versions.bun` and `Deno.version` | Bun 1.4.2, Deno 2.9.6                         | 110/110 on both. The workers ran inside Bun and Deno, not a forked Node.                                                                                                                                                                                                                                                                                                                                                                 |
| A 25-line adapter over `cloudflare:sockets`, driven through the harness pattern from #616, no `nodejs_compat` flag          | workerd via wrangler 4.131.0 (`wrangler dev`) | 7/7 scenarios: three sends on one connection; an acknowledgment split across two chunks; silent receiver → `SEND_TIMEOUT`; receiver drops after reading → `CONNECTION_LOST`; receiver writes the acknowledgment then FIN → `AA`, then `CONNECTION_LOST` on the next send; nothing listening → `CONNECT_FAILED`; `close()` against a receiver that never answers the FIN resolves in 0 ms. Events and `state` matched Node in every case. |
| `glion send` end-to-end with the Bun skip removed                                                                           | Bun 1.4.2                                     | Passes. The skip's comment ("Duplex.toWeb … not Bun") is stale.                                                                                                                                                                                                                                                                                                                                                                          |

Facts about the repository that bound the plan:

- `ci.yml` already has `testing-bun` and `testing-cf` jobs, and `turbo.json` declares `test:bun`, `test:cf`, and `test:deno`. Only `@glion/cli` defines `test:bun`, and it skips the one test that exercises the client. No package defines `test:cf` or `test:deno`. Both runtime jobs pass vacuously for the client today.
- The README says "for Node.js and Cloudflare Workers" and "Coming soon — TLS and Cloudflare Workers adapters". Neither ships.
- `docs/mllp-client-architecture.md` §7 specifies a reusable `describeMllpDuplexContract()` suite "run by node.test.ts today and by every future `/deno`, `/bun`, `/workers` adapter". It was never built; `tests/node.test.ts` holds the contract tests inline, Node-only.
- PRs #609, #615, and #616 shipped Workers and Deno adapters, a `wrangler.unstable_dev` harness, a per-test loopback receiver, ambient `cloudflare:sockets` and `Deno` type declarations (with the recorded reasons for not using `@cloudflare/workers-types`), self-signed TLS fixtures, and a per-runtime TLS-option rejection matrix. All of it was deleted in the #645 reset and is recoverable from git at `07c48c412` and `7d2faa6e2`.

## 1. Runtimes

The rule that decides the table: an adapter earns a subpath export only where `nodeSocket` cannot run. Everywhere else, support is a CI job and a README row, not code.

| Runtime                                                    | Outbound TCP API                                                        | `nodeSocket` runs?                     | Decision                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Node ≥ 20                                                  | `node:net`                                                              | Yes (shipped)                          | Keep.                                      |
| Bun                                                        | `node:net` compat; native `Bun.connect`                                 | Yes (measured)                         | **No new adapter.** Prove in CI, document. |
| Cloudflare Workers                                         | `cloudflare:sockets` `connect()`; `node:net` only under `nodejs_compat` | Not without the flag; untested with it | **Build `@glion/mllp-client/workers`.**    |
| Deno                                                       | `node:net` compat; native `Deno.connect` / `Deno.connectTls`            | Yes (measured)                         | Prove in CI now; native adapter on demand. |
| AWS Lambda, GCP and Azure Functions, Vercel Node, Electron | Node                                                                    | Yes                                    | Nothing to build; these are Node.          |
| Vercel Edge, Netlify Edge, Fastly Compute                  | None                                                                    | —                                      | Not supportable: no outbound TCP.          |
| Browsers                                                   | None                                                                    | —                                      | Not supportable.                           |

### 1.1 Bun — support by proof

**Why no native adapter.** `Bun.connect` is callback-based (`open`, `data`, `drain`, `close`, `error`). Bridging it to Web Streams is the drain and backpressure plumbing the old server-side `bunAdapter` carried (`packages/hl7v2-mllp/src/bun/adapter.ts` in history, about 150 lines), and that adapter was itself deleted in favour of `node:net` compat. MLLP is lockstep with one frame in flight, so there is no throughput a native socket could win back.

**Risk.** `stream.Duplex.toWeb` is Stability 1 (Experimental) in Node's own documentation, and Bun's and Deno's implementations are compat reimplementations. Probability that a Bun or Deno release breaks it: low. The detector is the conformance suite running under both in CI; the fallback is a native adapter (about 20 lines on Deno, about 150 on Bun). Pin `bun-version` in CI; it is `latest` today.

**Not measurable in a test.** Whether Bun honours the initial delay in `setKeepAlive(true, idleMs)`. Document keepalive on Bun as "enabled, delay unverified" rather than claim parity.

**Deliverables.** A `test:bun` script in `mllp-client`; delete the stale skip in `packages/glion/test/e2e/send.e2e.test.ts`; README runtimes table gains Bun.

### 1.2 Cloudflare Workers — build

The probe adapter, verbatim, is the shape to ship once typed and documented:

```ts
import { connect } from "cloudflare:sockets";

export function workersSocket(opts: WorkersSocketOptions): MllpSocket {
  let closeOpen = (): Promise<void> => Promise.resolve();
  return {
    close: () => closeOpen(),
    async connect(signal) {
      if (signal.aborted) {
        throw signal.reason;
      }
      const socket = connect(
        { hostname: opts.host, port: opts.port },
        { allowHalfOpen: false, secureTransport: opts.tls ? "on" : "off" }
      );
      const onAbort = () => void socket.close();
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        await socket.opened;
      } catch (error) {
        throw signal.aborted ? signal.reason : error;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      closeOpen = () => socket.close();
      return { readable: socket.readable, writable: socket.writable };
    },
  };
}
```

- **Options.** `host` and `port`, mirroring `nodeSocket`, not `hostname` from the Workers API (CLAUDE.md §7: names reflect the domain, not the implementation). `tls?: boolean` maps to `secureTransport`; `startTls` is out of scope. Programmatic CA, certificate, key, passphrase, and servername are rejected with `MllpInvalidOptionError`, the same set #616 rejected, because Workers cannot honour them.
- **`close()`.** workerd's `socket.close()` resolved in 0 ms against a peer that never answered the FIN, so no grace timer is needed. Whether it can reject after the peer already closed is the one open question; the conformance case C7 answers it, and the adapter absorbs that rejection only if the case shows one exists.
- **`socket.closed`** is unused. The client detects drops on the read side (arch doc §7.1), and the probe confirmed `CONNECTION_LOST` surfaces that way on workerd.
- **Build.** `deps.neverBundle: ["cloudflare:sockets"]` in `tsdown.config.ts`; an ambient `cloudflare-sockets.d.ts` rather than `@cloudflare/workers-types`, which declares Web Streams globals project-wide and conflicts with `node:stream/web` (recorded in #616's file header); subpath `./workers`. No `workerd` export condition on `.`: the socket is an explicit constructor option, so there is nothing for a condition to select.
- **Document for users.** Local `wrangler dev` proxies TCP, so `cause` messages differ from production (`proxy request failed, cannot connect…` locally versus a socket error at the edge); a production Worker reaches only internet-routable endpoints, so a receiver on a hospital's private network needs a publicly reachable TLS endpoint in front of it; Cloudflare blocks some destination ports.

### 1.3 Deno — prove now, native adapter on demand

`node:net` compat passed the full suite. A `test:deno` script and a `testing-deno` CI job (`denoland/setup-deno`; the turbo task already exists) cost one job and keep the claim true. A native `denoSocket` over `Deno.connect` is about 20 lines because `TcpConn` already exposes `readable` and `writable`; build it when a consumer asks or when compat regresses. Deno needs `--allow-net` either way.

### 1.4 TLS — a transport dimension, not a runtime

TLS is T0-4 (#657) in the production-readiness plan and sequenced first there. It is deferred out of this plan (D6); this section records only what the runtimes can do, so #657 designs against it. Its shape (i), a factory closing over TLS material, transposes onto the current API as `nodeSocket({ host, port, tls })`: `nodeSocket` already is that factory. What this plan adds is the per-runtime capability matrix and the test axis:

| Runtime | TLS mechanism            | Programmatic CA / cert / key | `passphrase` | `servername` | Skip verification           | Testable against a self-signed test CA |
| ------- | ------------------------ | ---------------------------- | ------------ | ------------ | --------------------------- | -------------------------------------- |
| Node    | `node:tls` `connect`     | yes                          | yes          | yes          | `rejectUnauthorized: false` | yes                                    |
| Bun     | `node:tls` compat        | expected yes; verify         | verify       | verify       | verify                      | yes                                    |
| Deno    | native `Deno.connectTls` | `caCerts`, cert chain, key   | no           | yes          | no (CLI flag only)          | yes                                    |
| Workers | `secureTransport: "on"`  | no                           | no           | no           | no                          | **no**; option validation only         |

Every conformance scenario in §2.3 runs plain and, where the last column is "yes", over TLS with the self-signed pair from #616's `test/tls-fixtures.ts` (at `07c48c412`). Workers TLS gets option-validation cases only, plus an optional manual check against a public TLS endpoint.

## 2. Conformance strategy

One specification, three layers, executed unchanged on every runtime, reported as a matrix.

### 2.1 Layers and owners

1. **Socket contract** — owned by each adapter. The README's four rules and arch doc §7's sentences, as numbered cases.
2. **Client behaviour over a real socket** — owned by the client, observable only per runtime. A scenario table with data-shaped outcomes.
3. **Interop** — owned by the ecosystem. Client against `@glion/mllp` `serve()` for the NAK and ERR round trip (ADR 0019), and optionally a third-party engine in Docker on a nightly schedule.

Everything else (`client.test.ts` over the in-memory socket, `connection.test.ts`, `messages.test.ts`) is runtime-neutral and is not conformance. It still runs under Bun and Deno because it is free and catches divergence in Web Streams, `AbortSignal`, and timers.

### 2.2 Socket contract cases

`tests/conformance/socket-contract.ts` exports `describeMllpSocketContract(name, adapter)` where `adapter` supplies `open(remote): MllpSocket`, and an `expects` record of adapter-declared bounds. Each case is a function of `(socket, receiver)` that returns an outcome record, so the same case runs in-process on Node, Bun, and Deno, and inside workerd through the harness by case id.

| #   | Rule | Case                                                              | Receiver                      | Assertion                                                                            |
| --- | ---- | ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| C1  | 1    | `connect()` rejects with `signal.reason` when aborted mid-attempt | blackhole (TEST-NET-1)        | rejects with the exact reason                                                        |
| C2  | 1    | rejects at once when the signal is already aborted                | none                          | rejects with the reason; nothing dialled                                             |
| C3  | 1    | a failed or aborted attempt leaves nothing open                   | blackhole; closed port        | `close()` resolves within 100 ms                                                     |
| C4  | 2    | `close()` never rejects                                           | accept                        | resolves `undefined`                                                                 |
| C5  | 2    | `close()` is idempotent                                           | accept                        | three concurrent calls and one after all resolve                                     |
| C6  | 2    | `close()` is bounded when the peer never answers the FIN          | `allowHalfOpen`, never ends   | resolves within `expects.closeBoundMs` (Node: `gracefulCloseMs` + 500; Workers: 100) |
| C7  | 2    | `close()` resolves after the peer already dropped                 | drop after the first exchange | resolves                                                                             |
| C8  | 3    | a pending read settles when the peer resets                       | `destroy()`                   | done or error, never parked                                                          |
| C9  | 3    | a pending read settles when the peer FINs                         | `end()`                       | done                                                                                 |
| C10 | 3    | bytes written before a graceful FIN arrive before end-of-stream   | `end(ack)` one-shot           | the acknowledgment is read, then done                                                |
| C11 | 4    | `close()` resolves while the reader and writer are locked         | accept                        | resolves                                                                             |
| C12 | wire | a 1 MiB payload round-trips (writable backpressure)               | echo                          | bytes equal                                                                          |
| C13 | wire | graceful close sends FIN, not RST                                 | records `end` versus `error`  | Node: `end`; asserted only where `expects.finOnClose`                                |

A frame split across chunks is exercised by scenario S2 rather than a contract case: reassembly belongs to the codec, and only the client observes it.

`expects` is the only per-adapter input. A new adapter that cannot meet a case declares it, and the report shows the gap instead of hiding it.

### 2.3 Client scenario table

`tests/conformance/scenarios.ts`: `{ name, receiver, run(client): Promise<Outcome>, expect }` with `Outcome` JSON-serialisable: `{ results: Array<{ code, controlId } | { errorCode, delivery? }>, events: string[], state, closeMs }`. Because outcomes are data, the same table drives in-process runs and the workerd harness, which receives `{ scenario, port }` over HTTP and returns the outcome.

| #   | Scenario                               | Receiver                           | Expected                                                                      |
| --- | -------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| S1  | three sends on one connection          | acknowledges each frame            | `AA` × 3; events `connect`, `disconnect:null`, `close`                        |
| S2  | acknowledgment split across two chunks | writes in two parts                | `AA`                                                                          |
| S3  | silent receiver                        | accepts, never writes              | `SEND_TIMEOUT`; `disconnect:SEND_TIMEOUT`; `state` `closed`                   |
| S4  | receiver drops after reading           | `destroy()` on data                | `CONNECTION_LOST`                                                             |
| S5  | one-shot peer                          | `end(ack)`                         | `AA`, then `CONNECTION_LOST` on the next send                                 |
| S6  | nothing listening                      | closed port                        | `CONNECT_FAILED`; events `close` only                                         |
| S7  | blackhole                              | TEST-NET-1, `connectTimeoutMs` 300 | `CONNECT_TIMEOUT`                                                             |
| S8  | application reject                     | answers `AE`                       | `AckApplicationError`; connection stays open; the next send is `AA`           |
| S9  | `destroy()` during a send              | silent                             | in-flight send rejects `CLOSED`; events `connect`, `disconnect:null`, `close` |
| S10 | `close()` from `connected`             | accept                             | resolves; `state` `closed`; `disconnect:null`                                 |

S11 (S1 over TLS) is deferred with D6. A `close()` during a send is not a scenario: the client waits the send out, so it reduces to S3 followed by S10.

Assert on `code` and on events. Never on `cause.message`: it is `ECONNREFUSED` on Node and `proxy request failed…` under `wrangler dev`.

### 2.4 Execution per runtime

| Runtime       | How the suite runs                                                                                                                                                               | Receiver                     | Script      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------- |
| Node 20/22/24 | vitest                                                                                                                                                                           | in-process `node:net`        | `test`      |
| Bun           | `bun --bun ./node_modules/vitest/vitest.mjs run` (the `vitest` bin is a shell shim Bun cannot execute; the CLI package already uses this form). Workers run in Bun: verified.    | in-process `node:net` compat | `test:bun`  |
| Deno          | `deno run -A ./node_modules/vitest/vitest.mjs run`. Workers run in Deno: verified.                                                                                               | in-process compat            | `test:deno` |
| Workers       | Node-side vitest spawns `wrangler dev` on a harness Worker that is a scenario and case runner; each test starts its own loopback receiver and POSTs `{ scenario \| case, port }` | Node process, per test       | `test:cf`   |

Why the harness and not `@cloudflare/vitest-pool-workers`: the receiver has to be a Node process regardless (workerd cannot listen), the pool's coverage instrumentation needs `node:inspector/promises` which workerd does not ship (recorded in #616), and the harness is the mode that has passed. Reconsider only if the pool gains a way to host the receiver.

### 2.5 CI

- `testing-bun` and `testing-cf` stop being vacuous once `mllp-client` defines the scripts. Add `testing-deno`. Pin Bun and Deno versions; bump deliberately.
- Coverage: Node only. Bun and Deno vitest runs can produce coverage but would double-count; workerd cannot. Codecov flags per runtime are not worth the noise.
- No retries in the runtime jobs. A flake in a conformance case is a finding about the runtime, not noise.

### 2.6 Reporting

The README "Runtimes" section becomes the matrix: runtime × adapter × TLS × keepalive × "tested in CI". Hand-maintained; the conformance suite is what makes each cell a claim rather than a hope.

## 3. Sequencing

| Step | Work                                                                                                                                                                  | Depends on    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1    | Extract `describeMllpSocketContract` and the scenario table from `tests/node.test.ts`; `tests/node.test.ts` becomes the Node instantiation. No behaviour change.      | —             |
| 2    | `test:bun`, `test:deno`, `testing-deno` job, pinned versions, delete the CLI skip, README matrix.                                                                     | 1             |
| 3    | `@glion/mllp-client/workers`: adapter, ambient types, `neverBundle`, harness and receiver re-landed from #616 against the new contract, `test:cf`, changeset (minor). | 1             |
| 4    | TLS axis: `nodeSocket({ tls })`, fixtures, S11 and C-cases over TLS on Node/Bun/Deno, Workers option validation.                                                      | T0-4 decision |
| 5    | Interop: client against `@glion/mllp` `serve()` for the NAK and ERR round trip.                                                                                       | 1             |

Steps 2 and 3 are independent of each other.

## 4. Decisions for the maintainer

- **D1** Bun by `node:net` compat with no native adapter. **Resolved 2026-09-10: yes.**
- **D2** Workers option names: `host` and `port` mirroring `nodeSocket` versus `hostname` mirroring `cloudflare:sockets`. **Resolved 2026-09-10: `host` and `port`.**
- **D3** Deno CI job now versus when a consumer asks. **Resolved 2026-09-10: now.**
- **D4** Conformance suite location. **Resolved 2026-09-10: in-repo `tests/conformance/`.** Promoting it to a `@glion/mllp-client/conformance` subpath for custom-adapter authors stays open; precedent: `abstract-level` ships its implementer suite.
- **D5** Workers execution. **Resolved 2026-09-10: the wrangler harness.**
- **D6** TLS option shape on `nodeSocket`. **Resolved 2026-09-10: TLS is a later issue, tracked in #657 (client and `glion send`) and #626 (Workers round trip). The per-runtime matrix in §1.4 was posted to #657.** Step 4 in §3 waits on it.

## 5. Calibrated risks

- Bun or Deno regressing `Duplex.toWeb` compat: low; detected by CI; fallback is a native adapter.
- workerd production versus `wrangler dev` divergence: medium for `cause` text, near zero for error codes and events; the suite asserts codes and events only.
- vitest under Bun or Deno flaking in CI: unknown; the local runs took 1.3 s and were clean; pinned versions and no retries keep any flake visible.
- Acknowledgment-then-RST loss on error teardown (ADR 0020 §7.1): identical exposure on every runtime, not introduced here.

## 6. What the implementation found

- **workerd `close()` on a socket that never opened** settles only once the attempt itself settles, and then rejects with the attempt's error. `workersSocket` therefore does not wait for it on a failed or aborted attempt; nothing is open, and the abort path stays bounded. Cases C1, C3 and scenario S7 pin this.
- **Exact project names.** vitest's `--project` filter treats parentheses as a pattern, so a project named `mllp-client (workerd)` matched every project. The projects are `mllp-client` and `mllp-client-workerd`.
- **`crypto.randomUUID()` over `node:crypto`** in the fixtures, so the same fixture module bundles into the harness Worker.
- **Reconnect (#714)**, implemented in parallel on `worktree/rapid-river-4206`, changes what S3, S4, S5 and S7 observe: a lost connection reconnects instead of closing. Whichever branch lands second re-pins those expectations; the scenario table is the place, and it is one table for every runtime.

## Related

- `docs/plans/2026-09-03-001-feat-mllp-client-production-readiness-plan.md` (T0-4 TLS), ADR 0019. ADR 0020 §5 and `docs/mllp-client-architecture.md` §7 first specified the conformance suite; both are withdrawn by ADR 0021 on the #714 branch.
- Issues #657 (TLS), #690 (idle drop), #714 (reconnect).
- PRs #609, #615, #616 (deleted adapters, harness, receiver, fixtures; git `07c48c412`, `7d2faa6e2`), #645 (the reset that removed them), #692 (the current client).
