/**
 * Discriminated error kinds surfaced by the glion CLI.
 *
 * Every kind listed here is produced by at least one throw/emit site
 * in the CLI. Consumers that switch on `GlionError.kind` or on the
 * wire `fatal.kind` field can rely on this union being exhaustive.
 */
export type GlionErrorKind =
  | "config-not-found"
  | "config-invalid"
  | "entry-load-failed"
  | "entry-not-mllp-instance"
  | "tls-read-failed"
  | "port-in-use"
  | "peer-dep-missing"
  | "watcher-failed"
  | "log-dir-unsafe"
  | "child-crashed"
  | "child-unresponsive";

/**
 * The single error class used throughout the glion CLI. Carries a
 * discriminated `kind`, structured `context` for machine consumers, an
 * actionable `hint` for humans, and an optional underlying `cause`.
 */
export class GlionError extends Error {
  readonly kind: GlionErrorKind;
  readonly context: Record<string, unknown>;
  readonly hint: string | undefined;
  override readonly cause: unknown;

  constructor(
    kind: GlionErrorKind,
    message: string,
    context: Record<string, unknown> = {},
    hint?: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "GlionError";
    this.kind = kind;
    this.context = context;
    this.hint = hint;
    this.cause = cause;
  }
}
