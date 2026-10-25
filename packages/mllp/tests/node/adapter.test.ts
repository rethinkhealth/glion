// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable no-empty-function
import type { Server } from "node:net";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import { createServer as createTlsServer } from "node:tls";

import { nodeAdapter } from "../../src/node/adapter";

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
    setTimeout: vi.fn(),
    write: vi.fn(() => true),
  });
  return socket as Readable & {
    destroy: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    setTimeout: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
}

type MockSocket = ReturnType<typeof createMockSocket>;

let connectionHandler: ((socket: MockSocket) => void) | undefined;
const mockServer = {
  address: vi.fn(() => ({ port: 9999 })),
  close: vi.fn((done?: CloseCallback) => {
    done?.();
  }),
  listen: vi.fn(),
  // The adapter registers `on("error", ...)` to keep later errors handled;
  // tests do not need to fire it but the mock must accept the registration.
  on: vi.fn(),
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
      createServer: vi.fn(
        (_options: unknown, handler: (socket: MockSocket) => void) => {
          connectionHandler = handler;
          return mockServer as unknown as Server;
        }
      ),
    };
  }
);

// oxlint-disable-next-line typescript/no-explicit-any
(vi as any).mock(
  import("node:tls"),
  async (
    importOriginal: () =>
      | Record<string, unknown>
      | PromiseLike<Record<string, unknown>>
  ) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      createServer: vi.fn(
        (_options: unknown, handler: (socket: MockSocket) => void) => {
          connectionHandler = handler;
          return mockServer as unknown as Server;
        }
      ),
    };
  }
);

const noop = () => {
  /* noop */
};

beforeEach(() => {
  connectionHandler = undefined;
  mockServer.address.mockReturnValue({ port: 9999 });
  mockServer.close.mockImplementation((done?: CloseCallback) => {
    done?.();
  });
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
  it("listens on plain TCP with keep-alive after 60 s and Nagle's algorithm off, and sets no timeout", () => {
    vi.mocked(createTlsServer).mockClear();
    const accepted: boolean[] = [];
    const adapter = nodeAdapter();
    adapter.listen({ port: 2575 }, (socket) => accepted.push(socket.secure));

    const socket = createMockSocket();
    connectionHandler?.(socket);

    expect(createServer).toHaveBeenLastCalledWith(
      { keepAlive: true, keepAliveInitialDelay: 60_000, noDelay: true },
      expect.any(Function)
    );
    expect(createTlsServer).not.toHaveBeenCalled();
    expect(accepted).toEqual([false]);
    expect(socket.setTimeout).not.toHaveBeenCalled();
  });

  it("passes tls to tls.createServer() with keep-alive and Nagle's algorithm off, and marks its sockets secure", () => {
    const tls = { ca: "ca", cert: "cert", key: "key", requestCert: true };
    const accepted: boolean[] = [];
    const adapter = nodeAdapter({ tls });
    adapter.listen({ port: 2575 }, (socket) => accepted.push(socket.secure));

    connectionHandler?.(createMockSocket());

    expect(createTlsServer).toHaveBeenLastCalledWith(
      { keepAlive: true, keepAliveInitialDelay: 60_000, noDelay: true, ...tls },
      expect.any(Function)
    );
    expect(accepted).toEqual([true]);
  });

  it("lets tls replace a socket option", () => {
    nodeAdapter({ tls: { cert: "cert", key: "key", noDelay: false } }).listen(
      { port: 2575 },
      noop
    );

    expect(createTlsServer).toHaveBeenLastCalledWith(
      {
        cert: "cert",
        keepAlive: true,
        keepAliveInitialDelay: 60_000,
        key: "key",
        noDelay: false,
      },
      expect.any(Function)
    );
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
});
