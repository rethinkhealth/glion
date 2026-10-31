import type { MllpRequest } from "./request";
import type { Context, Response } from "./types";

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
}

/**
 * Create a new Context for a message `parseRequest()` read.
 */
export function createContext<E>(
  options: CreateContextOptions<E>
): MessageContext<E> {
  const { request, env } = options;
  const variables = new Map<string, unknown>();
  let varSnapshot: Readonly<Record<string, unknown>> | undefined;

  // ── Build context ──────────────────────────────────────────────────
  const ctx: MessageContext<E> = {
    env,
    error: undefined,
    get<K extends string>(key: K): unknown {
      return variables.get(key);
    },
    req: request,
    res: undefined as Response | undefined,
    set<K extends string>(key: K, value: unknown): void {
      variables.set(key, value);
      varSnapshot = undefined;
    },
    get var(): Readonly<Record<string, unknown>> {
      if (!varSnapshot) {
        varSnapshot = Object.freeze(Object.fromEntries(variables));
      }
      return varSnapshot;
    },
  };

  return ctx;
}
