import type { Root } from "@glion/ast";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value as queryValue } from "@glion/util-query";

import { acknowledge } from "./acknowledge";
import type { ReceivedMessage } from "./message";
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
  /** The message, as `readMessage()` read it with `processor`. */
  message: ReceivedMessage;
  /** Connection metadata */
  connection: ConnectionInfo;
  /** HL7v2 unified processor */
  processor: Hl7v2Processor;
  /** The app's options, which `ctx.ack()` writes the acknowledgment with. */
  app: MllpOptions;
}

/**
 * Create a new Context for a message `readMessage()` read.
 *
 * `ctx.error` starts as the message's `error`. The routing fields and
 * `ctx.ack()` read the message's `header`, so they keep the values as
 * received, whatever the transforms or a handler change in the tree (see
 * ADR-0013).
 *
 * The expensive pipeline stages are lazy:
 *
 * - `ctx.tree()` — triggers `run()` (transformers: annotations, lint). Cached
 *   after first call.
 * - `ctx.result()` — triggers `run()` + `stringify()` (compilation, e.g., JSON
 *   via hl7v2Jsonify). Cached after first call.
 *
 * If no handler matches or middleware short-circuits before accessing
 * the tree, the transform and compile steps never execute.
 */
export function createContext(options: CreateContextOptions): MessageContext {
  const { app, message, connection, processor } = options;
  const { bytes, error, file, header, raw, tree: parsed } = message;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;

  const controlId = queryValue(header, "MSH.10")?.value ?? "";
  const messageType = queryValue(header, "MSH.9.1")?.value ?? "";
  const triggerEvent = queryValue(header, "MSH.9.2")?.value ?? "";
  const messageStructure = queryValue(header, "MSH.9.3")?.value ?? "";
  const version = queryValue(header, "MSH.12.1")?.value ?? "";

  // ── Lazy: transform (async, cached) ────────────────────────────────
  // run() applies all transformers: annotations, lint.
  // Only executes on first call to ctx.tree() or ctx.result().
  let transformedTree: Root | undefined;
  let transformPromise: Promise<Root> | undefined;

  function getTree(): Promise<Root> {
    if (transformedTree) {
      return Promise.resolve(transformedTree);
    }
    if (!transformPromise) {
      transformPromise = (async () => {
        // Hl7v2Processor's tail admits `undefined` (so the bare parser is
        // assignable), which makes unified type run()'s result as
        // `Root | Node`; an HL7v2 pipeline always yields the (possibly
        // transformed) Root.
        const result = (await processor.run(parsed, file)) as Root;
        transformedTree = result;
        return result;
      })();
    }
    return transformPromise;
  }

  // ── Lazy: compile (async, cached) ──────────────────────────────────
  // stringify() compiles the tree into the final format (e.g., JSON).
  // Only executes on first call to ctx.result(). Requires tree first.
  // Promise is cached (including rejections) to match getTree() behavior.
  let resultPromise: Promise<unknown | undefined> | undefined;

  function getResult(): Promise<unknown | undefined> {
    if (!resultPromise) {
      resultPromise = (async () => {
        const tree = await getTree();
        return processor.compiler ? processor.stringify(tree, file) : undefined;
      })();
    }
    return resultPromise;
  }

  // ── Build context ──────────────────────────────────────────────────
  const ctx: MessageContext = {
    ack(ackOptions?: AckOptions): Response {
      return { raw: toHl7v2(acknowledge(header, { ...ackOptions, ...app })) };
    },
    ast: parsed,
    connection: Object.freeze(connection),
    controlId,
    error,
    file,
    get<K extends string>(key: K): unknown {
      return variables.get(key);
    },
    messageStructure,
    messageType,
    req: Object.freeze({ bytes, raw }),
    res: undefined as Response | undefined,
    result: getResult,
    set<K extends string>(key: K, value: unknown): void {
      variables.set(key, value);
      varSnapshot = undefined;
    },
    tree: getTree,
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
