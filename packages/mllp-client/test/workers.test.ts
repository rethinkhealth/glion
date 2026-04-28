// oxlint-disable promise/avoid-new
/**
 * Cloudflare Workers adapter test suite.
 *
 * The Workers runtime exposes raw TCP via `cloudflare:sockets`, a
 * module that does not exist outside `workerd`. We mock it at the
 * vitest level so the adapter's wiring (param coercion,
 * `secureTransport` handling, `opened` awaiting, error mapping) can
 * be exercised in plain Node vitest.
 *
 * For end-to-end verification inside the actual Workers runtime,
 * `@cloudflare/vitest-pool-workers` is the standard tool, but it is
 * heavyweight and only meaningful when you're testing
 * Workers-specific platform behaviour. The MLLP exchange logic
 * itself is already covered by the runtime-free `test/core.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { frame, SAMPLE_ADT, VALID_AA } from "./fixtures";

// Module-scoped state — the mock factory references this via the
// closure so each test can reconfigure replies without re-mocking.
let mockReply: Uint8Array | "no-reply" = "no-reply";
let mockOpenedResult: "ok" | { error: Error } = "ok";
const mockCalls: { address: unknown; options: unknown }[] = [];
let mockCloseCount = 0;

vi.mock(import("cloudflare:sockets"), () => ({
  connect: (address: unknown, options: unknown) => {
    mockCalls.push({ address, options });

    let openResolve!: (info: {
      localAddress: string;
      remoteAddress: string;
    }) => void;
    let openReject!: (error: Error) => void;
    const opened = new Promise<{ localAddress: string; remoteAddress: string }>(
      (resolve, reject) => {
        openResolve = resolve;
        openReject = reject;
      }
    );

    if (mockOpenedResult === "ok") {
      openResolve({
        localAddress: "127.0.0.1:1234",
        remoteAddress: "127.0.0.1:2575",
      });
    } else {
      openReject(mockOpenedResult.error);
    }

    return {
      close: () => {
        mockCloseCount++;
        return Promise.resolve();
      },
      closed: Promise.resolve(),
      opened,
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          if (mockReply !== "no-reply") {
            controller.enqueue(mockReply);
          }
          controller.close();
        },
      }),
      // oxlint-disable-next-line typescript/no-explicit-any
      startTls: () => null as any,
      writable: new WritableStream<Uint8Array>(),
    };
  },
}));

// Imports must come after `vi.mock` so the mock is in place when the
// adapter resolves its `cloudflare:sockets` dependency.
const { MllpClient } = await import("../src/runtimes/workers");
const { MllpClientError, MllpClientErrorCode } =
  await import("../src/core/errors");

describe("MllpClient (workers adapter)", () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockCloseCount = 0;
    mockReply = "no-reply";
    mockOpenedResult = "ok";
  });

  it("calls cloudflare:sockets connect() with hostname/port and returns a parsed ACK", async () => {
    mockReply = frame(VALID_AA);
    const client = new MllpClient({ host: "mllp.example", port: 6661 });

    const ack = await client.send(SAMPLE_ADT);

    expect(ack.code).toBe("AA");
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0]?.address).toEqual({
      hostname: "mllp.example",
      port: 6661,
    });
  });

  it("requests secureTransport: 'on' when tls is set without insecure", async () => {
    mockReply = frame(VALID_AA);
    const client = new MllpClient({
      host: "mllp.example",
      port: 6661,
      tls: {},
    });

    await client.send(SAMPLE_ADT);

    expect(mockCalls[0]?.options).toMatchObject({ secureTransport: "on" });
  });

  it("requests secureTransport: 'off' when tls.insecure is true", async () => {
    mockReply = frame(VALID_AA);
    const client = new MllpClient({
      host: "mllp.example",
      port: 6661,
      tls: { insecure: true },
    });

    await client.send(SAMPLE_ADT);

    expect(mockCalls[0]?.options).toMatchObject({ secureTransport: "off" });
  });

  it("rejects with INVALID_INPUT when ca/cert/key is supplied (Workers cannot honour them)", async () => {
    const client = new MllpClient({
      host: "mllp.example",
      port: 6661,
      tls: { ca: "fake-ca-pem" },
    });

    try {
      await client.send(SAMPLE_ADT);
      expect.fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      expect((error as MllpClientError).code).toBe(
        MllpClientErrorCode.INVALID_INPUT
      );
    }
  });

  it("maps a failed `socket.opened` to CONNECTION_REFUSED", async () => {
    mockOpenedResult = { error: new Error("socket open failed") };
    const client = new MllpClient({ host: "mllp.example", port: 6661 });

    try {
      await client.send(SAMPLE_ADT);
      expect.fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      expect((error as MllpClientError).code).toBe(
        MllpClientErrorCode.CONNECTION_REFUSED
      );
    }
  });

  it("calls socket.close() after a successful exchange", async () => {
    mockReply = frame(VALID_AA);
    const client = new MllpClient({ host: "mllp.example", port: 6661 });

    await client.send(SAMPLE_ADT);

    expect(mockCloseCount).toBeGreaterThanOrEqual(1);
  });
});
