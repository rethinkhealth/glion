import { AckCode, isAckNakCode } from "@glion/ack";
import type { Root } from "@glion/ast";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { acknowledge } from "./acknowledge";
import { messageHeader } from "./request";
import type { MllpRequest } from "./request";
import { isResponse, toResponse } from "./response";
import type { MllpResponse } from "./response";
import type { AckOptions, Context, MllpOptions } from "./types";

/** A {@link Context} whose `error` the server records. */
export type MessageContext<E = unknown> = Omit<Context<E>, "error"> & {
  error: Error | undefined;
};

/**
 * Options for creating a Context instance.
 */
export interface CreateContextOptions<E> {
  /** The request, as `parseRequest()` read it. */
  request: MllpRequest;
  /** What the runtime passed to `handle()`; becomes `ctx.env`. */
  env: E;
  /** The app's options, which `ctx.ack()` writes the acknowledgment with. */
  app: MllpOptions & Required<Pick<MllpOptions, "serializer">>;
}

/**
 * Create a new Context for a message `parseRequest()` read. `ctx.ack()` reads
 * the MSH when it is called.
 */
export function createContext<E>(
  options: CreateContextOptions<E>
): MessageContext<E> {
  const { app, request, env } = options;
  const { serializer, ...defaults } = app;
  const { header, tree } = request;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;
  let res: MllpResponse | undefined;

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
    controlId: header.controlId,
    env,
    error: undefined,
    get<K extends string>(key: K): unknown {
      return variables.get(key);
    },
    messageStructure: header.messageStructure,
    messageType: header.messageCode,
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
    req: request,
    get res(): MllpResponse | undefined {
      return res;
    },
    set res(value: MllpResponse | undefined) {
      if (value !== undefined && !isResponse(value)) {
        throw new MllpServerError(MllpServerErrorCode.INVALID_RESPONSE);
      }
      res = value;
    },
    set<K extends string>(key: K, value: unknown): void {
      variables.set(key, value);
      varSnapshot = undefined;
    },
    triggerEvent: header.triggerEvent,
    get var(): Readonly<Record<string, unknown>> {
      if (!varSnapshot) {
        varSnapshot = Object.freeze(Object.fromEntries(variables));
      }
      return varSnapshot;
    },
    version: header.version,
  };

  return ctx;
}
