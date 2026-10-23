import type { Root } from "@glion/ast";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes } from "@glion/util-charset";
import { value as queryValue } from "@glion/util-query";
import { VFile } from "vfile";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { acknowledge } from "./acknowledge";
import type { AcknowledgeOptions } from "./acknowledge";
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
  /** The MLLP frame payload. */
  payload: Uint8Array;
  /** Connection metadata */
  connection: ConnectionInfo;
  /** HL7v2 unified processor */
  processor: Hl7v2Processor;
}

/**
 * Create a new Context for an incoming message.
 *
 * Only the **decode** and **parse** steps run eagerly (sync, fast). Never
 * throws: a payload that is not UTF-8, or a parser that throws, gives an
 * empty `Root` and sets `ctx.error`. Routing fields are
 * extracted as strings from the parsed tree immediately — these cached
 * strings are the values as parsed, before any transformer runs (see
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
export function createContext(options: CreateContextOptions): Context {
  const { payload, connection, processor } = options;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;

  // ── Eager: decode + parse (sync, fast) ─────────────────────────────
  // VFile carries the input through the pipeline and collects diagnostics.
  let raw = "";
  let parsed: Root = { children: [], type: "root" };
  let error: Error | undefined;
  // The tree ctx.ack() reads. For a payload that is not UTF-8 it is a lenient
  // decode, so the NAK still echoes the sender's MSH and MSA-2 its MSH-10.
  let replyOrigin: Root | undefined;
  try {
    raw = decodeBytes(payload);
  } catch (decodeError) {
    error = new MllpServerError(
      MllpServerErrorCode.INCOMPATIBLE_CHARSET,
      "The inbound message is not valid UTF-8; only UTF-8 is supported.",
      { cause: decodeError }
    );
    replyOrigin = leniently(processor, payload);
  }
  const file = new VFile(raw);
  if (!error) {
    try {
      parsed = processor.parse(file);
    } catch (parseError) {
      error =
        parseError instanceof Error
          ? parseError
          : new Error(String(parseError));
    }
  }

  // Extract routing fields as strings from the parsed tree.
  // These are cached immediately and keep the values as parsed, even
  // after transformers enrich the tree in-place.
  const controlId = queryValue(parsed, "MSH.10")?.value ?? "";
  const messageType = queryValue(parsed, "MSH.9.1")?.value ?? "";
  const triggerEvent = queryValue(parsed, "MSH.9.2")?.value ?? "";
  const messageStructure = queryValue(parsed, "MSH.9.3")?.value ?? "";
  const version = queryValue(parsed, "MSH.12.1")?.value ?? "";

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
  const ctx: Context = {
    ack(ackOptions?: AcknowledgeOptions): Response {
      return {
        raw: toHl7v2(acknowledge(replyOrigin ?? parsed, ackOptions)),
      };
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
    req: Object.freeze({ bytes: payload, raw }),
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

/**
 * `payload` decoded with U+FFFD for every byte that is not UTF-8, and parsed.
 * An empty tree when the parser throws.
 */
function leniently(processor: Hl7v2Processor, payload: Uint8Array): Root {
  try {
    return processor.parse(new VFile(new TextDecoder().decode(payload)));
  } catch {
    // The decode failure is already this message's error; a header the
    // parser cannot read leaves the NAK's MSA-2 empty.
    return { children: [], type: "root" };
  }
}
