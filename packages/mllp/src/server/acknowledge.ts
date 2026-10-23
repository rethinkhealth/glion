import { AckCode } from "@glion/ack";
import type { Field, Root } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { select, value } from "@glion/util-query";
import { gte, valid } from "@glion/util-semver";
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
  /**
   * MSH-3.1 and MSH-4.1. Default to the original message's MSH-5 and MSH-6,
   * copied whole.
   */
  sending?: { application: string; facility: string };
  /** MSH-11. Defaults to the original message's MSH-11, copied whole, else `P`. */
  processingId?: string;
}

/**
 * The acknowledgment of `origin`: an MSH and an MSA segment.
 *
 * The MSH swaps the original sender and receiver (MSH-3/4 ↔ MSH-5/6), each
 * field copied whole, sets MSH-7 to the current local time and MSH-9 to
 * `ACK^<MSH-9.2>^ACK` (`ACK^<MSH-9.2>` before v2.3.1, which has no MSH-9.3),
 * and echoes MSH-12.1. MSA-2 echoes the original MSH-10. Never adds an ERR
 * segment.
 */
export function acknowledge(
  origin: Root,
  options: AcknowledgeOptions = {}
): Root {
  const { code = AckCode.ApplicationAccept, text, sending } = options;
  const triggerEvent = field(origin, "MSH.9.2");
  const version = field(origin, "MSH.12.1");
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
      sending ? f(sending.application) : copy(origin, "MSH.5"),
      sending ? f(sending.facility) : copy(origin, "MSH.6"),
      copy(origin, "MSH.3"),
      copy(origin, "MSH.4"),
      f(timestamp),
      f(""),
      messageType(triggerEvent, version),
      f(options.id ?? uid()),
      options.processingId === undefined && field(origin, "MSH.11")
        ? copy(origin, "MSH.11")
        : f(options.processingId ?? "P"),
      f(version)
    ),
    s("MSA", f(code), f(field(origin, "MSH.10")), ...(text ? [f(text)] : []))
  );
}

/**
 * MSH-9 of the acknowledgment. MSH-9.3 exists from v2.3.1; a blank or
 * unreadable version gets it too.
 */
function messageType(triggerEvent: string, version: string): Field {
  if (!valid(version) || gte(version, "2.3.1")) {
    return f(c("ACK"), c(triggerEvent), c("ACK"));
  }
  return triggerEvent ? f(c("ACK"), c(triggerEvent)) : f("ACK");
}

function field(origin: Root, path: string): string {
  return value(origin, path)?.value ?? "";
}

function copy(origin: Root, path: string): Field {
  const node = select(origin, path)?.node as Field | undefined;
  return node ? structuredClone(node) : f("");
}
