import { AckCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { value } from "@glion/util-query";
import { formatDTM, Precision } from "@glion/util-timestamp";
import { uid } from "@glion/util-uid";

/** Options for {@link acknowledge}. */
export interface AcknowledgeOptions {
  /** MSA-1. Defaults to `AA`. */
  code?: AckCode;
  /**
   * MSA-3. Omitted when absent. This text goes to the trading partner: it
   * MUST NOT carry PHI or internal error details.
   */
  text?: string;
  /** MSH-10 of the acknowledgment. Defaults to a fresh `uid()`. */
  id?: string;
  /** MSH-3 and MSH-4. Default to the original message's MSH-5 and MSH-6. */
  sending?: { application: string; facility: string };
  /** MSH-11. Defaults to the original message's MSH-11, else `P`. */
  processingId?: string;
}

/**
 * The acknowledgment of `origin`: an MSH and an MSA segment.
 *
 * The MSH swaps the original sender and receiver (MSH-3/4 ↔ MSH-5/6), sets
 * MSH-7 to the current local time, MSH-9 to `ACK^<MSH-9.2>`, and echoes
 * MSH-12.1. MSA-2 echoes the original MSH-10. Never adds an ERR segment.
 */
export function acknowledge(
  origin: Root,
  options: AcknowledgeOptions = {}
): Root {
  const { code = AckCode.ApplicationAccept, text, sending } = options;
  const triggerEvent = field(origin, "MSH.9.2");
  const date = new Date();
  const timestamp = formatDTM({
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    month: date.getMonth() + 1,
    precision: Precision.Second,
    second: date.getSeconds(),
    year: date.getFullYear(),
  });

  return m(
    s(
      "MSH",
      f("|"),
      f("^~\\&"),
      f(sending?.application ?? field(origin, "MSH.5")),
      f(sending?.facility ?? field(origin, "MSH.6")),
      f(field(origin, "MSH.3")),
      f(field(origin, "MSH.4")),
      f(timestamp),
      f(""),
      triggerEvent ? f(c("ACK"), c(triggerEvent)) : f("ACK"),
      f(options.id ?? uid()),
      f(options.processingId ?? (field(origin, "MSH.11") || "P")),
      f(field(origin, "MSH.12.1"))
    ),
    s("MSA", f(code), f(field(origin, "MSH.10")), ...(text ? [f(text)] : []))
  );
}

function field(origin: Root, path: string): string {
  return value(origin, path)?.value ?? "";
}
