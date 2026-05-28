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
    setKeepAlive: vi.fn(),
    setNoDelay: vi.fn(),
    setTimeout: vi.fn(),
    write: vi.fn(() => true),
  });
  return socket as Readable & {
    destroy: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    setKeepAlive: ReturnType<typeof vi.fn>;
    setNoDelay: ReturnType<typeof vi.fn>;
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
  // Persistent listener for server-level errors. The adapter registers
  // `on("error", ...)` to keep later errors handled; tests do not need
  // to fire it but the mock must accept the registration.
  on: vi.fn(() => {}),
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
});
