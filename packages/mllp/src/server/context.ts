import type { Root } from "@glion/ast";
import { value as queryValue } from "@glion/util-query";
import { VFile } from "vfile";

import type {
  ConnectionInfo,
  Context,
  Hl7v2Processor,
  Response,
} from "./types";

/**
 * Options for creating a Context instance.
 */
export interface CreateContextOptions {
  /** Raw HL7 message string */
  raw: string;
  /** Raw bytes from the MLLP frame payload */
  bytes: Uint8Array;
  /** Connection metadata */
  connection: ConnectionInfo;
  /** HL7v2 unified processor */
  processor: Hl7v2Processor;
}

/**
 * Create a new Context for an incoming message.
 *
 * Only the **parse** step runs eagerly (sync, fast). Routing fields are
 * extracted as strings from the parsed tree immediately — these cached
 * strings always reflect the original wire values (see ADR-0013).
 *
 * The expensive pipeline stages are lazy:
 *
 * - `ctx.tree()` — triggers `run()` (transformers: annotations, escape decoding,
 *   lint). Cached after first call.
 * - `ctx.result()` — triggers `run()` + `stringify()` (compilation, e.g., JSON
 *   via hl7v2Jsonify). Cached after first call.
 *
 * If no handler matches or middleware short-circuits before accessing
 * the tree, the transform and compile steps never execute.
 */
export function createContext(options: CreateContextOptions): Context {
  const { raw, bytes, connection, processor } = options;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;

  // ── Eager: parse (sync, fast) ──────────────────────────────────────
  // VFile carries the input through the pipeline and collects diagnostics.
  const file = new VFile(raw);
  const parsed = processor.parse(file);

  // Extract routing fields as strings from the parsed tree.
  // These are cached immediately and always reflect the original
  // wire values, even after transformers enrich the tree in-place.
  const controlId = queryValue(parsed, "MSH-10")?.value ?? "";
  const messageType = queryValue(parsed, "MSH-9.1")?.value ?? "";
  const triggerEvent = queryValue(parsed, "MSH-9.2")?.value ?? "";
  const messageStructure = queryValue(parsed, "MSH-9.3")?.value ?? "";
  const version = queryValue(parsed, "MSH-12.1")?.value ?? "";

  // ── Lazy: transform (async, cached) ────────────────────────────────
  // run() applies all transformers: annotations, escape decoding, lint.
  // Only executes on first call to ctx.tree() or ctx.result().
  let transformedTree: Root | undefined;
  let transformPromise: Promise<Root> | undefined;

  function getTree(): Promise<Root> {
    if (transformedTree) {
      return Promise.resolve(transformedTree);
    }
    if (!transformPromise) {
      transformPromise = (async () => {
        const result = await processor.run(parsed, file);
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
  const ctx: Context = {
    ast: parsed,
    connection: Object.freeze(connection),
    controlId,
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
