# XState v5 — a working mental model (actors, services, callbacks, errors)

A durable model for reasoning about XState v5, distilled from the official docs,
the maintainers (Andarist / davidkpiano), and real-world machines — with how
`@glion/mllp-client` embodies each point. Sources at the end.

## 1. The foundation: an actor is a black box you talk to by mail

A running state machine **is** an actor: a process with private state that no one
else can read or mutate directly. Four consequences to internalise:

1. **Tell, not ask.** `actor.send(event)` enqueues an event and **returns
   nothing** — it is fire-and-forget. There is **no native "ask"** (send-and-await-a-reply).
   To get a result you observe a snapshot/subscription _later_, or
   carry it in a Promise you build yourself. `await actor.send(...)` for the
   answer is the #1 mistake coming from Promises.
2. **Sequential per actor, concurrent across actors.** Each actor processes one
   event at a time (atomic, race-free transitions); two _different_ actors run
   concurrently and cross-actor ordering is not guaranteed. → Work that must be
   serialized (single-flight, a FIFO queue) belongs **inside one actor** as
   states, not spread across several.
3. **State = finite control flow; context = infinite data.** Modes
   (idle/connecting/…) are states; counters, timestamps, the backoff ms, the
   socket handle, the last error are context. A `boolean` others branch on (e.g.
   `isLoading`) is a state masquerading as data — promote it.
4. **Isolation.** You cross an actor's boundary only with events (in) and
   snapshots (out). Reaching into another actor's context synchronously is the
   anti-pattern.

## 2. Actor kinds (the "services")

| Kind                   | One line                                                      | Use when                                                                                      | Errors surface as                                                                                     |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **machine**            | a statechart, the root unit you `createActor()`               | genuine modes + control flow + isolated state                                                 | throw → `status:'error'` + `snapshot.error`; child → `xstate.error.actor.<id>` (handle via `onError`) |
| **fromPromise**        | one-shot async, `(input, signal) => Promise`                  | a discrete op awaited **once** (connect, one request, handshake)                              | reject → `onError` (`event.error`); omit `onError` → escalates to parent                              |
| **fromCallback**       | "useEffect for a machine"; `({sendBack, receive}) => cleanup` | an open-ended **source** you must tear down (socket, listeners, interval)                     | no output/onDone; `sendBack` a terminal **event** + transition                                        |
| **fromTransition**     | a `(state, event) => state` reducer                           | accumulate state without modes/timers/invokes                                                 | throw → `status:'error'`                                                                              |
| **fromObservable**     | wraps an Observable; each emission → snapshot                 | you already have an RxJS source                                                               | observable error → `status:'error'`                                                                   |
| **invoked vs spawned** | a _placement_ choice                                          | **invoke** = lifetime of a state (auto-cleanup); **spawn** = imperative, lives until `stop()` | both → `xstate.error.actor.<id>`; invoked auto-cleans, spawned you must `stop()`                      |

## 3. Promise vs callback — the one question

**Does the work RESOLVE ONCE, or EMIT OVER TIME?**

- **Resolve once → `fromPromise`.** You get `onDone(output)`/`onError(error)` and
  a `{ signal }` that aborts on state exit, for free. Faking this with
  `fromCallback` means inventing synthetic done/error events.
- **Emit over time → `fromCallback`.** A live socket, listeners, intervals.
  Superpower: two-way (`sendBack` up, `receive` down). Hard limit: **no output,
  cannot be awaited** — model completion as a state, not a value.
- **Third case: not all I/O belongs in an actor at all.** Request/response with a
  real Promise return (our per-send exchange) stays _out_ of the machine; the
  machine only gates _when_ it's legal. Reach for an actor only for genuine
  independent lifecycle + isolated state, not to organise code.

## 4. `fromCallback` = useEffect for a state machine

`fromCallback(({ sendBack, receive, input, self }) => { /* setup */; return () => { /* teardown */ } })`

- **`sendBack(event)`** — the **only** ingress from the outside world into the
  machine (`socket.on('data', d => sendBack({type:'DATA', d}))`). Fire-and-forget.
- **`receive(handler)`** — commands the machine pushes _down_; requires the parent
  to **explicitly route** events to it (`sendTo('id')`/`forwardTo('id')`) — events
  do not auto-flow in.
- **The cleanup return is the point** — bind resource lifetime to **state**
  lifetime; forget it and you leak a socket/listener/timer per state entry.
- **Stale-context trap (#549):** the context captured at invoke time is a frozen
  snapshot; `assign` makes a new object, so the closure never sees later updates.
  Pass current values on the event: `sendTo('id', ({context}) => ({...}))`.
- Keep the callback a **thin bridge** — correlation/retry/single-flight are the
  machine's job, not closure variables. (Pocock's article is v4: `send`→`sendBack`,
  `onReceive`→`receive`.)

## 5. Errors — two worlds and the wall between them

- **In-machine (errors as DATA).** A rejection becomes `onError`; a child throw
  becomes `xstate.error.actor.<id>` (v5 removed `escalate` — throws propagate).
  Handle by transitioning: capture into context, route to **recovery** (backoff →
  retry) for transient failures or a **terminal** state for fatal ones. A durable
  client treats transient errors as _normal events_ and never "dies" on a blip.
- **External (the snapshot's error channel).** `snapshot.status === 'error'` with
  `snapshot.error`; `toPromise`/`waitFor` reject; the `subscribe` error callback
  fires.
- **The critical trap (#4852, Andarist: "the docs are wrong here"):** errored
  snapshots are **never delivered to `next`** listeners. `getSnapshot().status ===
'error'` is effectively unobservable via ordinary subscription. You **must** wire
  `subscribe({ next, error })` — pass an object, not a bare function, or you
  silently lose `error` and `complete`.
- **Four realities, not two:** `active` / `done` (has output) / `error` (has error)
  / **stopped** (cancelled — neither). A wrapper branching only on done/error
  **hangs** on a stopped/never-final actor.

## 6. Bridging an event-machine to `async`/`await`

`toPromise` / `waitFor` / `subscribe` / `getSnapshot` are four lenses on the same
`status + (output | error)`. Pick by the **shape of the need**:

- **One-shot run-to-completion → `toPromise(actor)`** — resolves `output` on
  `done`, rejects `error`. **Requires a reachable top-level final state with
  `output`**, or it hangs forever.
- **Await an intermediate condition with a deadline → `waitFor(actor, predicate,
{ timeout })`** — does **not** stop the actor. This is what `connect()` wants.
- **Long-lived push → `subscribe({ next, error, complete })`** — object, not a
  bare function.
- **Synchronous peek → `getSnapshot()`** — one-off read; don't poll it for changes.

**Catch at the edge:** translate the machine's error into your SDK's typed error
at the `await` boundary. Account for the stopped reality or your wrapper hangs.

## 7. Request/response — there is no "ask"

For a protocol where many requests share one connection (WebSocket, MLLP), the
machine cannot natively match an inbound reply to its request, and modelling it as
states explodes. **Correlation lives outside the machine** (Andarist, #549): one
long-lived owner holds a pending-map (`id → resolver`), matches each reply by id,
and resolves the right caller. **The machine only gates** (single-flight). At the
SDK boundary: read a correlation id, register a resolver, tell the connection to
write, resolve when the matching reply arrives. **Never `await send()` for a
reply.**

## 8. Decision guide

- Discrete async result awaited once → invoke `fromPromise`; wire
  `onDone`/`onError`; thread `{ signal }` so state-exit cancels.
- Open-ended source to tear down → `fromCallback`; `sendBack` up, `receive` down,
  **return cleanup**; completion is an event, not a value.
- Lifetime = a state → **invoke** (auto-clean); dynamic count → **spawn** (you own
  `stop()`).
- Request/response over a shared connection → pending-map outside; machine gates;
  return a real Promise; never await `send()`.
- Await terminal → `toPromise` (needs a top-level final + output). Await an
  intermediate with deadline → `waitFor`. Push → `subscribe({error})`. Peek →
  `getSnapshot()`.
- Detect failure outside → `subscribe({ error })` / `onError` / `toPromise`+catch.
  **Never** read `status==='error'` from `next`.
- Root actor that might throw at startup → `const a = createActor(m); const p =
toPromise(a); a.start(); await p;` (attach the error sink **before** `start()` —
  startup throws are synchronous and otherwise leak as uncaught, #4928).
- Transient failure in a durable client → capture to context, transition to
  backoff/recovery, retry; reserve final/error states for the unrecoverable.
- Mode or value? Finite modes → state; counters/handles/last-error → context.
- Backoff → a delayed state (`after` from a context counter): exponential, capped
  under `setTimeout`'s ~24-day rollover, jittered, **reset on success**.

## 9. Pitfalls (each with its mitigation)

- **Awaiting `send()` for a result** → observe via subscribe/`waitFor`/`toPromise`,
  or a resolver-map outside.
- **Errored snapshots not delivered to `next` (#4852)** → always
  `subscribe({ next, error })`; `onError` on invokes; `toPromise`+catch.
- **Wiring the error sink _after_ `start()` (#4928)** → build `toPromise`/subscribe
  before `start()`; root with no observer → uncaught crash.
- **`toPromise` with no top-level final state hangs; a stopped actor settles
  neither** → give success a final+output; account for stopped (we use `waitFor` +
  read `context.error` instead).
- **Reading mutable context inside a long-lived callback (#549)** → it's frozen;
  pass values on the event via `sendTo`.
- **Forgetting `fromCallback`'s cleanup return** → leaks per state entry; always
  return teardown.
- **Leaving an invoked-promise state before it settles discards the result; an
  ignored `signal` leaks the in-flight work** → keep the state active until it
  settles; thread `signal` into every cancelable call.
- **Omitting `onError` on an invoked `fromPromise`** → the rejection escalates and
  errors the parent (sometimes intended; usually not).
- **`stop()`-ing the root to cancel one child** → tears down the whole system; stop
  the child, or use invoked actors (state-scoped).
- **Spawning without owning teardown** → leaks until the parent stops; prefer
  invoke when lifetime = a state.
- **Modeling counters as states / hiding control flow in context booleans** →
  finite modes → states, infinite values → context.

## 10. How `@glion/mllp-client` embodies this

- **`open: fromPromise`** invoked in `connecting` — one-shot dial; `onDone` stores
  the duplex → `connected`, `onError` stamps the error → `backingOff`/`closed`; the
  `{ signal }` aborts on state-exit, which _is_ the connect-timeout/CLOSE
  cancellation. (§2, §3, decision guide)
- **`backingOff`** = a delayed state (`after` from `context.attempt`, via
  `backoffDelay`), reset on success — exactly the §8 backoff rule.
- **`connected` is compound (`ready`/`sending`)** — single-flight as a state, so
  `SEND_IN_PROGRESS` falls out of the transition table. (§1.2)
- **Errors as context.** Every failure is stamped into `context.error`
  (CONNECT_FAILED/TIMEOUT/ABORTED/DROPPED) on the failing transition — surfaced by
  reading it at the edge, sidestepping the §5 external-channel fragility.
- **`connect()` bridges via `waitFor`** (intermediate state + then read
  context/throw), not `toPromise` — exactly §6.
- **`send()` is the §7 split:** `machine.send('SEND')` gates single-flight,
  `conn.exchange()` does the real request/response over a plain Promise,
  `machine.send('SETTLED')` releases the wire in `finally`. The machine never
  carries the response.
- **`rejectConnect`/`rejectSend`** read `getSnapshot().can()/.matches()/.status`
  synchronously — turning "the machine declined this event" into a typed error at
  the SDK edge (the application layer's job, §1.1).
- **The read loop stays plain** (`connection.ts`, calling `onDrop` →
  `machine.send('DROP')`) rather than a `fromCallback` — the thin-bridge philosophy
  taken to "not every I/O needs an actor" (§3 third case).

## Sources

- Stately docs — [actor model](https://stately.ai/docs/actor-model),
  [actors](https://stately.ai/docs/actors), [invoke](https://stately.ai/docs/invoke),
  [promise actors](https://stately.ai/docs/promise-actors),
  [callback actors](https://stately.ai/docs/callback-actors),
  [final states](https://stately.ai/docs/final-states),
  [migration](https://stately.ai/docs/migration)
- Maintainer threads — [#4852](https://github.com/statelyai/xstate/issues/4852)
  (errored snapshots not delivered to `next`),
  [#4928](https://github.com/statelyai/xstate/issues/4928) (startup throw / uncaught
  root error), [#549](https://github.com/statelyai/xstate/issues/549) (no ask
  primitive; correlate outside; frozen callback context)
- Community — Matt Pocock,
  [Why I love invoked callbacks](https://dev.to/mattpocockuk/xstate-why-i-love-invoked-callbacks-2f6i)
  (v4 naming); Kevin H. Xu,
  [An XState WebSocket Machine](https://www.kevinhxu.com/posts/xstate-websocket-machine/);
  Daniel Imfeld, [SWR with XState](https://imfeld.dev/writing/swr_with_xstate)
