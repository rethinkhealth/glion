---
"@glion/mllp": minor
---

Breaking: make the app the part that runs on any runtime. `app.handle(payload, env?)` replies to one message with no connection, `handleConnection()` runs MLLP over any Web Streams socket, and `serve()` takes the handler instead of the app.

- Change `app.handle(payload, connection)` to `app.handle(payload, env?)`. `env` becomes the new `ctx.env`, typed by `Mllp<E>`; it is required when `E` excludes `undefined`. `handle` is bound to the app, so `app.handle` can be passed on as a function.
- Remove `ctx.connection`. Under `serve()`, the connection is `ctx.env.connection`: type the app `Mllp<NodeEnv>` to read it.
- Add `handleConnection(handle, socket, { signal })`, which replies to every message on a socket with `readable` and `writable` Web Streams, and the `MllpSocket` and `HandleConnectionOptions` types. It rejects with `MllpServerError` `PROTOCOL_VIOLATION` when the MLLP framing breaks.
- Change `serve(app, options)` to `serve({ handle: app.handle, ...options })`.
- Move `ConnectionInfo` from `@glion/mllp` to `@glion/mllp/node`, and add `NodeEnv` there.
- Close the connection when `handle()` rejects (`NO_PARSER`, a second middleware error, a `next()` called twice), after reporting it to `onError`. Before, the connection stayed open and every message on it went unanswered.
- Make `Context`, `Middleware`, `Handler` and `RouteFilter` generic over `env`; each defaults to `unknown`.
- Answer every message a remote system sent before closing its side of the connection. Before, Node ended the server's side too, and replies still being built were lost.
- End the connection when the remote system resets it or it times out while a message is being handled. Before, writing the reply waited forever, and `server.close()` never resolved.
- Report a socket error other than a reset, a broken pipe or a timeout, such as a failed TLS record, to `onError`. Before, it ended the connection as a close does.
- Throw `MllpServerError` `INVALID_OPTION` when `serve()` is given no `handle` function or a `port` that is not an integer from 0 to 65535, as when it is still called as `serve(app, options)`.
