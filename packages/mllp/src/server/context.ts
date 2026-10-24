import { AckCode, isAckNakCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { value as queryValue } from "@glion/util-query";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { acknowledge } from "./acknowledge";
import { isReply, toReply } from "./reply";
import type { Reply } from "./reply";
import { messageHeader } from "./request";
import type { MllpRequest } from "./request";
import type { AckOptions, Context, Hl7v2Processor, MllpOptions } from "./types";

/** A {@link Context} whose `error` the server records. */
export type MessageContext<E = unknown> = Omit<Context<E>, "error"> & {
  error: Error | undefined;
};

/**
 * Options for creating a Context instance.
 */
export interface CreateContextOptions<E> {
  /** The request, as `parseRequest()` parsed it with `processor`. */
  request: MllpRequest;
  /** What the runtime passed to `handle()`; becomes `ctx.env`. */
  env: E;
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
export function createContext<E>(
  options: CreateContextOptions<E>
): MessageContext<E> {
  const { app, request, env, processor } = options;
  const { serializer, ...defaults } = app;
  const { file, raw, tree } = request;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;
  let res: Reply | undefined;

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
  const ctx: MessageContext<E> = {
    ack(ackOptions?: AckOptions): Reply {
      const code = ackOptions?.code ?? AckCode.ApplicationAccept;
      if (isAckNakCode(code)) {
        throw new MllpServerError(MllpServerErrorCode.REPLY_IS_NAK);
      }
      return toReply(
        acknowledge(parsed, { ...ackOptions, ...defaults }),
        serializer
      );
    },
    ast: tree,
    controlId,
    env,
    error: undefined,
    file,
    get<K extends string>(key: K): unknown {
      return variables.get(key);
    },
    messageStructure,
    messageType,
    reply(tree: Root): Reply {
      if (!messageHeader(tree)) {
        throw new MllpServerError(MllpServerErrorCode.REPLY_WITHOUT_MSH);
      }
      const reply = toReply(tree, serializer);
      if (reply.code && isAckNakCode(reply.code)) {
        throw new MllpServerError(MllpServerErrorCode.REPLY_IS_NAK);
      }
      return reply;
    },
    req: Object.freeze({ raw }),
    get res(): Reply | undefined {
      return res;
    },
    set res(value: Reply | undefined) {
      if (value !== undefined && !isReply(value)) {
        throw new MllpServerError(MllpServerErrorCode.INVALID_REPLY);
      }
      res = value;
    },
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
