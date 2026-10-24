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

const CR = 0x0d;
const LF = 0x0a;

/** Decodes UTF-8, with U+FFFD for each byte that is not UTF-8. */
const LENIENT_DECODER = new TextDecoder();

/** A {@link Context} whose `error` the server records. */
export type MessageContext = Omit<Context, "error"> & {
  error: Error | undefined;
  /** Whether the message starts with a message header segment (MSH). */
  readonly hasHeader: boolean;
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
 * `ctx.ack()` answers the MSH as the processor parsed it: the transforms
 * `ctx.tree()` runs do not change the acknowledgment.
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
  const { error, file, parsed, raw } = read(payload, processor);

  // The MSH ctx.ack() answers: the parsed tree's own until ctx.tree() runs
  // the transforms, a copy of it from then on. A payload that did not decode
  // or parse has no tree; its first segment is parsed alone, with U+FFFD for
  // each byte that is not UTF-8:
  //
  //   MSH|^~\&|A|B|C|D|…||ADT^A01|MSG001|P|2.5.1\rPID|…  →  MSH|^~\&|A|B|C|D|…
  let header = error
    ? parseHL7v2(LENIENT_DECODER.decode(firstLine(payload)))
    : undefined;
  const first = (header ?? parsed).children[0];
  const hasHeader = first?.type === "segment" && first.name === "MSH";

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
        header ??= copyHeader(parsed);
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
      return { raw: toHl7v2(acknowledge(header ?? parsed, ackOptions)) };
    },
    ast: parsed,
    connection: Object.freeze(connection),
    controlId,
    error,
    file,
    get<K extends string>(key: K): unknown {
      return variables.get(key);
    },
    hasHeader,
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
 * `payload` decoded as UTF-8 and parsed by `processor`, in a VFile that
 * carries it through the pipeline and collects diagnostics. Never throws: a
 * payload that is not UTF-8 gives empty text, a parser throw an empty
 * `Root`, and either one `error`.
 */
function read(
  payload: Uint8Array,
  processor: Hl7v2Processor
): { error?: Error; file: VFile; parsed: Root; raw: string } {
  const parsed: Root = { children: [], type: "root" };
  let raw: string;
  try {
    raw = decodeBytes(payload);
  } catch (error) {
    return {
      error: new MllpServerError(
        MllpServerErrorCode.INCOMPATIBLE_CHARSET,
        "The inbound message is not valid UTF-8; only UTF-8 is supported.",
        { cause: error }
      ),
      file: new VFile(""),
      parsed,
      raw: "",
    };
  }
  const file = new VFile(raw);
  try {
    return { file, parsed: processor.parse(file), raw };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      file,
      parsed,
      raw,
    };
  }
}

/** The bytes of the first segment of `payload`. */
function firstLine(payload: Uint8Array): Uint8Array {
  const cr = payload.indexOf(CR);
  const head = cr === -1 ? payload : payload.subarray(0, cr);
  const lf = head.indexOf(LF);
  return lf === -1 ? head : head.subarray(0, lf);
}

/** A tree holding a copy of the MSH `tree` starts with, if any. */
function copyHeader(tree: Root): Root {
  const [first] = tree.children;
  const msh = first?.type === "segment" && first.name === "MSH";
  return { children: msh ? [structuredClone(first)] : [], type: "root" };
}
