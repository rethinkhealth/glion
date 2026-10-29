---
"@glion/mllp": minor
---

Breaking: make the app the part that runs on any runtime. `app.handle(payload, env?)` replies to one message with no connection, `handleConnection()` runs MLLP over any Web Streams socket, and `serve()` takes the handler instead of the app.

- Change `app.handle(raw, bytes, connection)` to `app.handle(payload, env?)`. `payload` is the message bytes without MLLP framing, which `handle()` decodes as UTF-8; it rejects with `MllpServerError` `INCOMPATIBLE_CHARSET` for a payload that is not UTF-8. `env` becomes the new `ctx.env`, typed by `Mllp<E>`; it is required when `E` excludes `undefined`. `handle` is bound to the app, so `app.handle` can be passed on as a function.
- Resolve `app.handle()` to the response's `raw` as UTF-8 bytes. `handleConnection()` and `serve()` take a `handle` that resolves to bytes.
- Remove `ctx.connection`. Under `serve()`, the connection is `ctx.env.connection`: type the app `Mllp<NodeEnv>` to read it.
- Add `handleConnection(handle, socket, { signal })`, which replies to every message on a socket with `readable` and `writable` Web Streams, and the `MllpSocket` and `HandleConnectionOptions` types. It rejects with `MllpServerError` `PROTOCOL_VIOLATION` when the remote system's bytes break MLLP framing, and with the new `UNFRAMEABLE_RESPONSE` when a response carries a VT or FS byte, which before was reported as `PROTOCOL_VIOLATION`.
- Change `serve(app, options)` to `serve({ handle: app.handle, ...options })`.
- Move `ConnectionInfo` from `@glion/mllp` to `@glion/mllp/node`, and add `NodeEnv` there.
- Freeze `ConnectionInfo` before `onConnect` runs, so `onConnect` can no longer add properties to the connection; keep per-connection data in `connection.state`.
- Make `Context`, `Middleware`, `Handler`, `ErrorHandler` and `RouteFilter` generic over `env`; each defaults to `unknown`.
- Answer every message a remote system sent before closing its side of the connection. Before, Node ended the server's side too, and replies still being built were lost (#1150).
- End the connection when the remote system resets it or it times out while a message is being handled. Before, writing the reply waited forever, and `server.close()` never resolved (#1151).
- Stop reading when the `signal` given to `handleConnection()`, or `server.close()`, aborts: the message in progress is answered, and a message still arriving is dropped without being reported. Before, a shutdown in the middle of a message could be reported as the sender's `PROTOCOL_VIOLATION`.
- Add `MllpServerErrorCode.CONNECTION_LOST`. A socket given to `handleConnection()` errors its `readable` with it once the connection is torn down; `handleConnection()` then resolves without handling the messages still in transit, and reports nothing.
- Report a socket error other than a reset, a broken pipe or a timeout, such as a failed TLS record, to `onError`. Before, it ended the connection as a close does.
- Throw `MllpServerError` `INVALID_OPTION` when `serve()` is still called as `serve(app, options)`, is given no `handle` function, or is given a `port` that is not an integer from 0 to 65535; the error's `option` names which: `options`, `handle` or `port`.
