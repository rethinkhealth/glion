/**
 * Captures `console.log`, `console.info`, `console.warn`, and
 * `console.error` in the child process and redirects them to
 * structured `log` events on the emitter.
 *
 * ## Why this exists
 *
 * The child's stdout is a structured JSON event stream — raw
 * `console.log("hello")` would produce a malformed line that the
 * parent's `parseLine()` silently drops. Users expect console
 * output to be visible, so we intercept it and emit proper events.
 *
 * ## How it works
 *
 * Each console method is replaced with a wrapper that:
 *
 * 1. Formats arguments the same way Node's `util.format` does (via `%s`/`%d`/`%j`
 *    placeholders or space-joined values)
 * 2. Emits a `{ t: "log", level, message }` event. `console.log` and
 *    `console.info` both map to level `"info"`; `console.warn` → `"warn"`;
 *    `console.error` → `"error"`. There's no distinction between `console.log`
 *    and `console.info` at the event level — both are info.
 *
 * The original methods are NOT preserved — writing raw text to
 * stdout would corrupt the JSON event stream. stderr is also
 * captured because the parent surfaces stderr lines as `warning`
 * events, and structured `log` events with a level are more useful.
 *
 * Install this BEFORE loading the user's entry module so all
 * console calls in user code (and their dependencies) are captured.
 */

import { format } from "node:util";

import type { LogLevel } from "../config/logging.js";
import type { PartialEvent } from "../events.js";

/**
 * `console.log` and `console.info` are both everyday informational
 * output — nothing in the glion wire contract treats them
 * differently, so they both emit level "info". `warn` and `error`
 * map to their matching severities.
 */
const METHOD_TO_LEVEL: Record<"log" | "info" | "warn" | "error", LogLevel> = {
  error: "error",
  info: "info",
  log: "info",
  warn: "warn",
};

/**
 * Replaces the global console methods with structured event emitters.
 * Call once at child startup, before importing user code.
 */
export function installConsoleCapture(
  emit: (event: PartialEvent) => void
): void {
  for (const method of ["log", "info", "warn", "error"] as const) {
    const level = METHOD_TO_LEVEL[method];
    console[method] = (...args: unknown[]) => {
      emit({ level, message: format(...args), t: "log" });
    };
  }
}
