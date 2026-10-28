import { AckCode, isAckNakCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { value as queryValue } from "@glion/util-query";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { acknowledge } from "./acknowledge";
import { messageHeader } from "./request";
import type { MllpRequest } from "./request";
import { isResponse, toResponse } from "./response";
import type { MllpResponse } from "./response";
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
  let res: MllpResponse | undefined;

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
    ack(ackOptions?: AckOptions): MllpResponse {
      const code = ackOptions?.code ?? AckCode.ApplicationAccept;
      if (isAckNakCode(code)) {
        throw new MllpServerError(MllpServerErrorCode.RESPONSE_IS_NAK);
      }
      return toResponse(
        acknowledge(tree, { ...ackOptions, ...defaults }),
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
    reply(message: Root): MllpResponse {
      if (!messageHeader(message)) {
        throw new MllpServerError(MllpServerErrorCode.RESPONSE_WITHOUT_MSH);
      }
      const reply = toResponse(message, serializer);
      if (reply.code && isAckNakCode(reply.code)) {
        throw new MllpServerError(MllpServerErrorCode.RESPONSE_IS_NAK);
      }
      return reply;
    },
    req: Object.freeze({ raw }),
    get res(): MllpResponse | undefined {
      return res;
    },
    set res(value: MllpResponse | undefined) {
      if (value !== undefined && !isResponse(value)) {
        throw new MllpServerError(MllpServerErrorCode.INVALID_RESPONSE);
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
