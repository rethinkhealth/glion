# ADR 0032: One Server, Many Connections

## Status

Proposed (2026-10-22)

Extends ADR 0011. Relates to #906 (shutdown) and #1065 (remote system identity).

## Context

An MLLP receiver listens on one port, and remote systems connect to it over TCP. Each connection is lockstep: the sending system writes one framed message and waits for its acknowledgment before it writes the next (ADR 0011). ADR 0011 says connections may be persistent or transient, but not how many a server holds at once, or what holds between them.

`serve()` accepts any number of connections and runs each one independently: its own read loop, its own `connection.state`, its own `onConnect` and `onDisconnect`. Handlers on different connections run interleaved on the event loop. None of this is written down as a contract.

Several connections to one port are ordinary:

- **Several sending systems.** A laboratory system, a registration system, and a radiology system each hold their own connection.
- **One sending system, several connections.** Integration engines open one connection per outbound channel.
- **A reconnect.** A sending system whose network drops opens a new connection while the server still holds the old one. TCP reports a peer that vanished without closing only when keep-alive probes or an idle timeout find it; with neither, never.

The reconnect decides the question. A server that holds one connection at a time refuses the reconnect, and the interface is down until the stale connection ends. A server that closes the old connection when a new one arrives lets two misconfigured senders knock each other off in turn. So the server accepts more than one connection, and the questions are what holds across them.

Order matters in HL7v2. An `ADT^A08` (update patient information) processed before the `ADT^A01` (admit) it follows changes a patient who is not yet admitted. Within one connection, lockstep keeps order. Across connections, nothing does.

Interface engines take the same position: they accept several connections on one listener, optionally capped, and order holds per connection. A sending system that needs strict order sends over one connection.

## Decision

1. **A server accepts any number of connections, and handles them concurrently.** Each connection runs its own read, handle, and reply loop. A message on one connection does not wait for a message on another.

2. **Order holds within a connection, and only there.** The server hands a connection's messages to the app one at a time, in the order they arrived, and replies before it reads the next. It does not order messages across connections. A sending system that needs its messages processed in order sends them over one connection.

3. **The connection is the unit of state and lifecycle.** `connection.state` belongs to one connection and is discarded when it closes. `onConnect` and `onDisconnect` fire once per connection. The server has no notion of a remote system that spans connections. Whether it gains one, and what identifies it (a client certificate's subject, an address), is decided with #1065.

4. **A limit on connections is optional, and refuses connections past it.** `serve()` takes `maxConnections`, unset by default, and sets Node's `server.maxConnections`: a connection past the limit is closed as soon as it is accepted, before any message is read. The server never closes an open connection to make room, because that connection may be in the middle of a message, and two senders would take the slot from each other in turn.

5. **A stale connection ends by keep-alive; an idle connection ends only by choice.** Every connection has TCP keep-alive, probing after 60 s idle (#1073), so a connection whose remote system is gone ends while a quiet remote system that is still there keeps its connection. `serve()` takes no option to change it; over TLS, a socket option set in `tls` replaces the server's, as Node's `TlsOptions` allows. MLLP feeds can be quiet for hours, so an idle timeout is not the default: `socketTimeout` ends any connection idle past it, and is off unless set. A caller who turns keep-alive off in `tls` with `socketTimeout` also off accepts that stale connections can fill `maxConnections` and lock out a reconnecting sender; the reference documentation says so next to `maxConnections`.

6. **Closing the server ends every connection after its message.** `close()` stops accepting connections, ends each open connection once the message it is handling, if any, has been answered, and resolves when every connection has closed (#906).

## Consequences

- The `@glion/mllp` README states decisions 2 and 3: order holds within a connection, and `connection.state` is per connection.
- `maxConnections` is new on `serve()` and in `glion.config.ts`.
- A handler that keeps state across connections (a cache, a counter) does so in its own module, and owns the concurrency that comes with it.
- Per-system rules (ordering across a system's connections, an allowlist, the client certificate facts in #1065) need a remote system identity first, and are out of scope here.
