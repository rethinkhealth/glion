// oxlint-disable promise/avoid-new
/**
 * Deno adapter test suite.
 *
 * The Deno adapter calls the runtime-provided `Deno.connect` /
 * `Deno.connectTls` globals. We monkey-patch `globalThis.Deno`
 * before importing the adapter so its wiring (TLS option coercion,
 * `insecure` rejection, error mapping) can be exercised in plain
 * Node vitest.
 *
 * For end-to-end verification inside the actual Deno runtime, write
 * a `*.deno.test.ts` file that runs via `deno test` against a real
 * server. The MLLP exchange logic itself is already covered by the
 * runtime-free `test/core.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { frame, SAMPLE_ADT, VALID_AA } from "./fixtures";

// Captured calls and configurable state for the fake Deno globals.
const mockState = {
  closeCount: 0,
  connectCalls: [] as { type: "tcp" | "tls"; options: unknown }[],
  connectError: undefined as Error | undefined,
  reply: "no-reply" as Uint8Array | "no-reply",
};

interface DenoLike {
  connect(opts: unknown): Promise<unknown>;
  connectTls(opts: unknown): Promise<unknown>;
}

// oxlint-disable-next-line typescript/no-explicit-any
const globals = globalThis as any;
let originalDeno: DenoLike | undefined;

// Install the mock before importing the adapter — the adapter
// captures references to `Deno.connect` / `Deno.connectTls` lazily
// inside its `connect` function, so the global must be set whenever
// `denoConnect` runs (not only at import time).
function installMockDeno(): void {
  originalDeno = globals.Deno;
  const fakeConn = () => ({
    close: () => {
      mockState.closeCount++;
    },
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        if (mockState.reply !== "no-reply") {
          controller.enqueue(mockState.reply);
        }
        controller.close();
      },
    }),
    writable: new WritableStream<Uint8Array>(),
  });

  globals.Deno = {
    connect(options: unknown) {
      mockState.connectCalls.push({ options, type: "tcp" });
      if (mockState.connectError) {
        return Promise.reject(mockState.connectError);
      }
      return Promise.resolve(fakeConn());
    },
    connectTls(options: unknown) {
      mockState.connectCalls.push({ options, type: "tls" });
      if (mockState.connectError) {
        return Promise.reject(mockState.connectError);
      }
      return Promise.resolve(fakeConn());
    },
  };
}

function uninstallMockDeno(): void {
  if (originalDeno === undefined) {
    Reflect.deleteProperty(globals, "Deno");
  } else {
    globals.Deno = originalDeno;
  }
}

// Imports must come after we install the mock the first time so
// that any module-load-time logic in the adapter sees the fake.
installMockDeno();
const { MllpClient } = await import("../src/runtimes/deno");
const { MllpClientError, MllpClientErrorCode } =
  await import("../src/core/errors");
uninstallMockDeno();

describe("MllpClient (deno adapter)", () => {
  beforeEach(() => {
    mockState.closeCount = 0;
    mockState.connectCalls.length = 0;
    mockState.connectError = undefined;
    mockState.reply = "no-reply";
    installMockDeno();
  });

  afterEach(() => {
    uninstallMockDeno();
  });

  it("calls Deno.connect for plain TCP and returns a parsed ACK", async () => {
    mockState.reply = frame(VALID_AA);
    const client = new MllpClient({ host: "mllp.example", port: 2575 });

    const ack = await client.send(SAMPLE_ADT);

    expect(ack.code).toBe("AA");
    expect(mockState.connectCalls).toHaveLength(1);
    expect(mockState.connectCalls[0]?.type).toBe("tcp");
    expect(mockState.connectCalls[0]?.options).toEqual({
      hostname: "mllp.example",
      port: 2575,
    });
  });

  it("calls Deno.connectTls when tls is set, forwarding ca/cert/key", async () => {
    mockState.reply = frame(VALID_AA);
    const client = new MllpClient({
      host: "mllp.example",
      port: 6661,
      tls: {
        ca: "ca-pem-string",
        cert: "cert-pem-string",
        key: "key-pem-string",
        servername: "secure.example",
      },
    });

    await client.send(SAMPLE_ADT);

    expect(mockState.connectCalls[0]?.type).toBe("tls");
    expect(mockState.connectCalls[0]?.options).toMatchObject({
      caCerts: ["ca-pem-string"],
      certChain: "cert-pem-string",
      hostname: "secure.example",
      port: 6661,
      privateKey: "key-pem-string",
    });
  });

  it("decodes Uint8Array TLS material into PEM strings", async () => {
    mockState.reply = frame(VALID_AA);
    const client = new MllpClient({
      host: "mllp.example",
      port: 6661,
      tls: { ca: new TextEncoder().encode("encoded-ca-pem") },
    });

    await client.send(SAMPLE_ADT);

    expect(mockState.connectCalls[0]?.options).toMatchObject({
      caCerts: ["encoded-ca-pem"],
    });
  });

  it("rejects with INVALID_INPUT when tls.insecure is true (Deno cannot disable verification at runtime)", async () => {
    const client = new MllpClient({
      host: "mllp.example",
      port: 6661,
      tls: { insecure: true },
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

  it("maps a failed Deno.connect to CONNECTION_REFUSED", async () => {
    mockState.connectError = new Error("connection refused");
    const client = new MllpClient({ host: "mllp.example", port: 2575 });

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

  it("calls conn.close() after a successful exchange", async () => {
    mockState.reply = frame(VALID_AA);
    const client = new MllpClient({ host: "mllp.example", port: 2575 });

    await client.send(SAMPLE_ADT);

    expect(mockState.closeCount).toBeGreaterThanOrEqual(1);
  });
});
