import { value as queryValue } from "@glion/util-query";

import { acknowledge } from "./acknowledge";
import type { MllpRequest } from "./request";
import type {
  AckOptions,
  ConnectionInfo,
  Context,
  Hl7v2Processor,
  MllpOptions,
  Response,
} from "./types";

/** A {@link Context} whose `error` the server records. */
export type MessageContext = Omit<Context, "error"> & {
  error: Error | undefined;
};

/**
 * Options for creating a Context instance.
 */
export interface CreateContextOptions {
  /** The request, as `parseRequest()` parsed it with `processor`. */
  request: MllpRequest;
  /** Connection metadata */
  connection: ConnectionInfo;
  /** HL7v2 unified processor */
  processor: Hl7v2Processor;
  /** The app's options, which `ctx.ack()` writes the acknowledgment with. */
  app: MllpOptions & Required<Pick<MllpOptions, "serializer">>;
}

/**
 * Create a new Context for a message `parseRequest()` parsed.
 *
 * The routing fields are read from the message's MSH once, so they keep their
 * values whatever a handler changes in the tree. `ctx.ack()` reads the MSH
 * when it is called. `ctx.result()` runs the processor's compiler on first
 * call.
 */
export function createContext(options: CreateContextOptions): MessageContext {
  const { app, request, connection, processor } = options;
  const { serializer, ...defaults } = app;
  const { file, raw, tree } = request;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;

  const controlId = queryValue(tree, "MSH.10")?.value ?? "";
  const messageType = queryValue(tree, "MSH.9.1")?.value ?? "";
  const triggerEvent = queryValue(tree, "MSH.9.2")?.value ?? "";
  const messageStructure = queryValue(tree, "MSH.9.3")?.value ?? "";
  const version = queryValue(tree, "MSH.12.1")?.value ?? "";

  let compiled: { value: unknown } | undefined;

  function getResult(): Promise<unknown | undefined> {
    compiled ??= {
      value: processor.compiler ? processor.stringify(tree, file) : undefined,
    };
    return Promise.resolve(compiled.value);
  }

  // ── Build context ──────────────────────────────────────────────────
  const ctx: MessageContext = {
    ack(ackOptions?: AckOptions): Response {
      return {
        raw: serializer(acknowledge(tree, { ...ackOptions, ...defaults })),
      };
    },
    ast: tree,
    connection: Object.freeze(connection),
    controlId,
    error: undefined,
    file,
    get<K extends string>(key: K): unknown {
      return variables.get(key);
    },
    messageStructure,
    messageType,
    req: Object.freeze({ raw }),
    res: undefined as Response | undefined,
    result: getResult,
    set<K extends string>(key: K, value: unknown): void {
      variables.set(key, value);
      varSnapshot = undefined;
    },
    tree: () => Promise.resolve(tree),
    triggerEvent,
    get var(): Readonly<Record<string, unknown>> {
      if (!varSnapshot) {
        varSnapshot = Object.freeze(Object.fromEntries(variables));
      }
      return varSnapshot;
    },
    version,
  };

  return ctx;
}
