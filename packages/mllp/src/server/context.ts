import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
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

const SEGMENT_SEPARATOR = /[\r\n]/;

/** A {@link Context} whose `error` the server records. */
export type MessageContext = Omit<Context, "error"> & {
  error: Error | undefined;
};

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
 * ADR-0013). When the message raised an error, they are read from its MSH,
 * decoded with U+FFFD for each byte that is not UTF-8.
 *
 * `ctx.ack()` answers the MSH as received: a change to the tree does not
 * change the acknowledgment.
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
  const { payload, connection, processor } = options;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;

  // ── Eager: decode + parse (sync, fast) ─────────────────────────────
  // VFile carries the input through the pipeline and collects diagnostics.
  let raw = "";
  let parsed: Root = { children: [], type: "root" };
  let error: Error | undefined;
  try {
    raw = decodeBytes(payload);
  } catch (decodeError) {
    error = new MllpServerError(
      MllpServerErrorCode.INCOMPATIBLE_CHARSET,
      "The inbound message is not valid UTF-8; only UTF-8 is supported.",
      { cause: decodeError }
    );
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

  // The MSH as received, which ctx.ack() answers, parsed from the text on
  // first use so it never changes with the tree. A payload that is not
  // UTF-8 is decoded with U+FFFD:
  //
  //   MSH|^~\&|A|B|C|D|…||ADT^A01|MSG001|P|2.5.1\rPID|…  →  MSH|^~\&|A|B|C|D|…
  let header = error
    ? parseHL7v2(firstSegment(new TextDecoder().decode(payload)))
    : undefined;

  // Routing fields keep the values as parsed, even after transformers
  // enrich the tree in-place; from the header when the message raised an
  // error before it had a tree.
  const fields = header ?? parsed;
  const controlId = queryValue(fields, "MSH.10")?.value ?? "";
  const messageType = queryValue(fields, "MSH.9.1")?.value ?? "";
  const triggerEvent = queryValue(fields, "MSH.9.2")?.value ?? "";
  const messageStructure = queryValue(fields, "MSH.9.3")?.value ?? "";
  const version = queryValue(fields, "MSH.12.1")?.value ?? "";

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
    ack(ackOptions?: AcknowledgeOptions): Response {
      header ??= parseHL7v2(firstSegment(raw));
      return { raw: toHl7v2(acknowledge(header, ackOptions)) };
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

/** The text of the first segment of `text`. */
function firstSegment(text: string): string {
  const end = text.search(SEGMENT_SEPARATOR);
  return end === -1 ? text : text.slice(0, end);
}
