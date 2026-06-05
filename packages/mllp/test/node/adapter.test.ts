// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable no-empty-function
import type { Server } from "node:net";
import { Readable } from "node:stream";

import { nodeAdapter } from "../../src/node/adapter.js";

// oxlint-disable-next-line prefer-await-to-callbacks
type CloseCallback = (err?: Error) => void;

/**
 * Create a mock socket that extends Readable (required by Readable.toWeb)
 * and stubs the net.Socket methods we need to verify.
 */
function createMockSocket() {
  const socket = new Readable({
    read() {
      /* noop */
    },
  });
  Object.assign(socket, {
    destroy: vi.fn(),
    end: vi.fn(),
    localPort: 2575,
    remoteAddress: "127.0.0.1",
    remotePort: 54_321,
    resume: vi.fn(),
    setKeepAlive: vi.fn(),
    setNoDelay: vi.fn(),
    setTimeout: vi.fn(),
    write: vi.fn(() => true),
  });
  // `destroyed` is a prototype getter on Readable; redefine it as a writable
  // own property so close() idempotency tests can toggle it.
  Object.defineProperty(socket, "destroyed", {
    configurable: true,
    value: false,
    writable: true,
  });
  return socket as Readable & {
    destroy: ReturnType<typeof vi.fn>;
    destroyed: boolean;
    end: ReturnType<typeof vi.fn>;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    resume: ReturnType<typeof vi.fn>;
    setKeepAlive: ReturnType<typeof vi.fn>;
    setNoDelay: ReturnType<typeof vi.fn>;
    setTimeout: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
}

type MockSocket = ReturnType<typeof createMockSocket>;

let connectionHandler: ((socket: MockSocket) => void) | undefined;
let serverErrorHandler: ((err: Error) => void) | undefined;
const mockServer = {
  address: vi.fn(() => ({ port: 9999 })),
  close: vi.fn((done?: CloseCallback) => {
    done?.();
  }),
  listen: vi.fn(),
  // Capture the adapter's persistent `on("error", ...)` registration so tests
  // can fire a post-listen server error.
  // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-callbacks
  on: vi.fn((event: string, cb: (err: Error) => void) => {
    if (event === "error") {
      serverErrorHandler = cb;
    }
  }),
  // Simulate the "listening" event firing synchronously so that the
  // listening promise resolves and tests do not hang.
  // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-callbacks
  once: vi.fn((event: string, cb: () => void) => {
    if (event === "listening") {
      // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-callbacks
      cb();
    }
  }),
};

// oxlint-disable-next-line typescript/no-explicit-any
(vi as any).mock(
  import("node:net"),
  async (
    importOriginal: () =>
      | Record<string, unknown>
      | PromiseLike<Record<string, unknown>>
  ) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      createServer: vi.fn((handler: (socket: MockSocket) => void) => {
        connectionHandler = handler;
        return mockServer as unknown as Server;
      }),
    };
  }
);

const noop = () => {
  /* noop */
};

beforeEach(() => {
  connectionHandler = undefined;
  serverErrorHandler = undefined;
  mockServer.address.mockReturnValue({ port: 9999 });
  mockServer.close.mockReset();
  mockServer.close.mockImplementation((done?: CloseCallback) => {
    done?.();
  });
  mockServer.on.mockClear();
  mockServer.listen.mockReset();
  // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-callbacks
  mockServer.once.mockImplementation((event: string, cb: () => void) => {
    if (event === "listening") {
      // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-callbacks
      cb();
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nodeAdapter", () => {
  it("sets keepAlive(true, 60000) and noDelay(true) by default, does NOT set timeout", () => {
    const adapter = nodeAdapter();
    adapter.listen({ port: 2575 }, noop);

    const socket = createMockSocket();
    connectionHandler?.(socket);

    expect(socket.setKeepAlive).toHaveBeenCalledWith(true, 60_000);
    expect(socket.setNoDelay).toHaveBeenCalledWith(true);
    expect(socket.setTimeout).not.toHaveBeenCalled();
  });

  it("calls setTimeout when socketTimeout option is provided", () => {
    const adapter = nodeAdapter({ socketTimeout: 30_000 });
    adapter.listen({ port: 2575 }, noop);

    const socket = createMockSocket();
    connectionHandler?.(socket);

    expect(socket.setTimeout).toHaveBeenCalledWith(30_000);
  });

  it("destroys socket when timeout event fires", () => {
    const adapter = nodeAdapter({ socketTimeout: 30_000 });
    adapter.listen({ port: 2575 }, noop);

    const socket = createMockSocket();
    connectionHandler?.(socket);

    expect(socket.destroy).not.toHaveBeenCalled();
    socket.emit("timeout");
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("does NOT call setKeepAlive when keepAlive is false", () => {
    const adapter = nodeAdapter({ keepAlive: false });
    adapter.listen({ port: 2575 }, noop);

    const socket = createMockSocket();
    connectionHandler?.(socket);

    expect(socket.setKeepAlive).not.toHaveBeenCalled();
    expect(socket.setNoDelay).toHaveBeenCalledWith(true);
  });

  it("handle.port returns correct port and handle.close() resolves", async () => {
    mockServer.address.mockReturnValue({ port: 4567 });

    const adapter = nodeAdapter();
    const handle = adapter.listen({ port: 2575 }, noop);

    expect(handle.port).toBe(4567);
    await expect(handle.close()).resolves.toBeUndefined();
    expect(mockServer.close).toHaveBeenCalled();
  });

  it("handle.port falls back to listenOpts.port when server.address() returns null", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    mockServer.address.mockReturnValue(null as any);

    const adapter = nodeAdapter();
    const handle = adapter.listen({ port: 2575 }, noop);

    expect(handle.port).toBe(2575);
  });

  it("writable stream waits for drain when socket.write returns false", async () => {
    const socket = createMockSocket();
    // When write() returns false, writeToSocket awaits the "drain" event.
    // Schedule the drain emission to fire after the once() listener is set up.
    socket.write.mockImplementationOnce(() => {
      setImmediate(() => socket.emit("drain"));
      return false;
    });

    let writable: WritableStream<Uint8Array> | undefined;
    const adapter = nodeAdapter();
    adapter.listen({ port: 2575 }, (s) => {
      writable = s.writable;
    });
    connectionHandler?.(socket);
    expect(writable).toBeDefined();

    const writer = writable!.getWriter();
    await writer.write(new Uint8Array([0x01]));

    expect(socket.write).toHaveBeenCalled();
  });

  it("writable stream close() calls socket.end()", async () => {
    const socket = createMockSocket();

    let writable: WritableStream<Uint8Array> | undefined;
    const adapter = nodeAdapter();
    adapter.listen({ port: 2575 }, (s) => {
      writable = s.writable;
    });
    connectionHandler?.(socket);
    expect(writable).toBeDefined();

    const writer = writable!.getWriter();
    await writer.close();
    expect(socket.end).toHaveBeenCalled();
  });

  it("writable stream abort() calls socket.destroy()", async () => {
    const socket = createMockSocket();

    let writable: WritableStream<Uint8Array> | undefined;
    const adapter = nodeAdapter();
    adapter.listen({ port: 2575 }, (s) => {
      writable = s.writable;
    });
    connectionHandler?.(socket);
    expect(writable).toBeDefined();

    const writer = writable!.getWriter();
    await writer.abort();
    expect(socket.destroy).toHaveBeenCalled();
  });

  // ── G1: post-listen server errors are observed, not dropped ──────────
  it("routes a post-listen server error to onServerError without closing the server", () => {
    const onServerError = vi.fn();
    const adapter = nodeAdapter();
    // The mock fires "listening" synchronously, so the server is already
    // listening when we fire the error → it is a post-listen error.
    adapter.listen({ onServerError, port: 2575 }, noop);

    expect(serverErrorHandler).toBeDefined();
    const boom = new Error("post-listen boom");
    serverErrorHandler?.(boom);

    expect(onServerError).toHaveBeenCalledWith(boom);
    // A post-listen error does not tear the server down — it keeps serving.
    expect(mockServer.close).not.toHaveBeenCalled();
  });

  it("rejects the listening promise and closes the server on a pre-listen error", async () => {
    // Suppress the synchronous "listening" event so the error is pre-listen.
    mockServer.once.mockImplementation(() => {
      /* never fire listening */
    });
    const onServerError = vi.fn();
    const adapter = nodeAdapter();
    const handle = adapter.listen({ onServerError, port: 2575 }, noop);

    serverErrorHandler?.(new Error("EADDRINUSE"));

    await expect(handle.listening).rejects.toThrow("EADDRINUSE");
    expect(mockServer.close).toHaveBeenCalled();
    // Pre-listen failure is a startup error, not the post-listen channel.
    expect(onServerError).not.toHaveBeenCalled();
  });

  // ── G3: AdapterSocket.close() is idempotent and never throws ─────────
  it("close() resumes then ends a live socket", () => {
    const socket = createMockSocket();
    let adapterSocket: { close(): void } | undefined;
    const adapter = nodeAdapter();
    adapter.listen({ port: 2575 }, (s) => {
      adapterSocket = s;
    });
    connectionHandler?.(socket);

    adapterSocket?.close();
    expect(socket.resume).toHaveBeenCalled();
    expect(socket.end).toHaveBeenCalled();
  });

  it("close() is a no-op on an already-destroyed socket (idempotent, never throws)", () => {
    const socket = createMockSocket();
    socket.destroyed = true;
    let adapterSocket: { close(): void } | undefined;
    const adapter = nodeAdapter();
    adapter.listen({ port: 2575 }, (s) => {
      adapterSocket = s;
    });
    connectionHandler?.(socket);

    expect(() => {
      adapterSocket?.close();
      adapterSocket?.close();
    }).not.toThrow();
    expect(socket.end).not.toHaveBeenCalled();
    expect(socket.resume).not.toHaveBeenCalled();
  });

  // ── G4: a stalled write is bounded by writeTimeout ───────────────────
  it("destroys the socket and rejects the write when the drain deadline expires", async () => {
    const socket = createMockSocket();
    // Backpressure (write returns false) and the peer never drains.
    socket.write.mockImplementationOnce(() => false);

    let writable: WritableStream<Uint8Array> | undefined;
    const adapter = nodeAdapter({ writeTimeout: 20 });
    adapter.listen({ port: 2575 }, (s) => {
      writable = s.writable;
    });
    connectionHandler?.(socket);

    const writer = writable!.getWriter();
    await expect(writer.write(new Uint8Array([0x01]))).rejects.toThrow();
    expect(socket.destroy).toHaveBeenCalled();
  });
});
