# HTTP to MLLP gateway

An HTTP service that sends the HL7v2 message in each request to one receiving system over MLLP, and answers with that system's acknowledgment as JSON. It keeps one connection open across requests with [`@glion/mllp-client`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-client), and runs on Node.js with no build step.

## How to use

```bash
pnpm create glion my-gateway --example mllp-gateway
cd my-gateway
pnpm install
pnpm start    # POST http://127.0.0.1:8080/messages → MLLP 127.0.0.1:2575
pnpm test     # every outcome below, against an in-process receiving system
```

Run the [`mllp-server`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server) example as the receiving system, then:

```bash
curl -H 'content-type: x-application/hl7-v2+er7' --data-binary @samples/adt-a01.hl7 http://127.0.0.1:8080/messages
# {"code":"AA","controlId":"MSG001"}
```

## What's in it

- `src/gateway.ts` — `gateway({ dial })`: the HTTP server, the MLLP client, and the mapping from outcome to status.
- `src/main.ts` — reads the configuration, dials the receiving system, listens, and shuts down on `SIGINT` and `SIGTERM`.
- `samples/adt-a01.hl7` — a message to send.
- `tests/` — the outcomes below.

## Outcomes

Each request's body is one HL7v2 message, sent as `text/plain` or `x-application/hl7-v2+er7`, at most 1 MiB, with segments ended by CR or LF.

| Outcome                                                       | Status                     | Body                                                       |
| ------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Accepted: `AA` or `CA`                                        | `200`                      | `code`, `controlId`, `text`                                |
| Refused: `AE`, `AR`, `CE`, or `CR`                            | `422`                      | `code`, `controlId`, `errorCode`, `severity`, `text`       |
| The body is not a message that can be sent, such as no MSH-10 | `400`                      | `code`, `delivery: "not-sent"`, `error`                    |
| Not sent: the receiving system cannot be reached              | `503`                      | `code`, `delivery: "not-sent"`, `error`, and `Retry-After` |
| Sent, outcome unknown: the connection failed mid-exchange     | `502`                      | `code`, `delivery: "unknown"`, `error`                     |
| Sent, outcome unknown: no acknowledgment within 30 s          | `504`                      | `code`, `delivery: "unknown"`, `error`                     |
| Another path, method, or content type, or a larger body       | `404`, `405`, `415`, `413` | `error`                                                    |

The status comes from the client's `delivery`, the one fact a retry needs. A `503` is safe to send again as it is. After a `502` or `504` the receiving system may already have the message, so check before sending it again. The response never repeats the message it was sent.

## How it uses the client

- **One connection for every request.** Requests that arrive together are sent one at a time, in the order they arrived; the client queues them.
- **A new client after a failure.** A client closes when its connection fails and stays closed, so the next request opens a new one. The failed message is never sent again on its own.
- **Socket options in `dial`.** `dial` returns `net.connect()` with Nagle's algorithm off and TCP keep-alive on, so a receiving system that vanishes while the connection is idle is noticed. Return `tls.connect()` instead for TLS; [`mllp-tls`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-tls) shows how.
- **A drained shutdown.** On `SIGINT` or `SIGTERM` the gateway stops accepting requests, answers the ones in progress, then closes the connection.

## Configuration

| Variable    | Default     | Description                           |
| ----------- | ----------- | ------------------------------------- |
| `HOST`      | `127.0.0.1` | Interface the HTTP server listens on. |
| `PORT`      | `8080`      | Port the HTTP server listens on.      |
| `MLLP_HOST` | `127.0.0.1` | Host of the receiving system.         |
| `MLLP_PORT` | `2575`      | MLLP port of the receiving system.    |

## Notes

- Requires Node.js 22.18 or later, which runs TypeScript directly.
- The gateway does not authenticate its callers, so it listens on loopback by default. Put authentication in front of it before listening anywhere else.
- The queue is in memory: a message waiting in it is lost if the process stops. An interface that must not lose messages keeps its own persistent queue and sends from it.
- [`@glion/mllp-client`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-client) — the client's options, errors, and `delivery`.
