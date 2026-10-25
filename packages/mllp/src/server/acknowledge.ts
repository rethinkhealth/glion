import { AckCode } from "@glion/ack";
import type { Delimiters, Field, Root } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { select, value } from "@glion/util-query";
import { gte, valid } from "@glion/util-semver";
import { formatDTM, nowDTM, Precision } from "@glion/util-timestamp";
import { uid } from "@glion/util-uid";
import { DEFAULT_DELIMITERS } from "@glion/utils";

/**
 * MSH-11 when neither the options nor the original message give one: `P`,
 * Production (HL7v2 Table 0103).
 */
const DEFAULT_PROCESSING_ID = "P";

/** Options for {@link acknowledge}. */
export interface AcknowledgeOptions {
  /** MSA-1. Defaults to `AA`. */
  code?: AckCode;
  /** MSH-10 of the acknowledgment. Defaults to a fresh `uid()`. */
  id?: string;
  /**
   * MSH-3.1 and MSH-4.1. Default to the original message's MSH-5 and MSH-6,
   * copied whole.
   */
  sending?: { application: string; facility: string };
  /**
   * MSH-11. Defaults to the original message's MSH-11, copied whole, else `P`
   * (Production).
   */
  processingId?: string;
  /**
   * The delimiters MSH-1 and MSH-2 declare. Each one not given is the
   * standard one: `|` and `^~\&`.
   */
  delimiters?: Partial<Omit<Delimiters, "segment">>;
  /**
   * The IANA time zone MSH-7 is read in, such as `America/New_York`. Defaults
   * to the host's time zone. `UTC` gives the offset `-0000`.
   */
  timeZone?: string;
}

/**
 * The acknowledgment of `origin`: an MSH and an MSA segment.
 *
 * MSH-1 and MSH-2 declare `delimiters`, never the original message's. The
 * MSH swaps the original sender and receiver (MSH-3/4 ↔ MSH-5/6), each
 * field copied whole, sets MSH-7 to the current time to the second in
 * `timeZone`, with that zone's offset from UTC, and MSH-9 to
 * `ACK^<MSH-9.2>^ACK` (`ACK^<MSH-9.2>` before v2.3.1, which has no MSH-9.3),
 * and echoes MSH-12.1. The MSA holds MSA-1 and MSA-2, which echoes the
 * original MSH-10. Never writes MSA-3 or an ERR segment.
 *
 * @throws {RangeError} When `options.timeZone` is not an IANA time zone name.
 */
export function acknowledge(
  origin: Root,
  options: AcknowledgeOptions = {}
): Root {
  const { code = AckCode.ApplicationAccept, sending, timeZone } = options;
  const delimiters = { ...DEFAULT_DELIMITERS, ...options.delimiters };
  const triggerEvent = field(origin, "MSH.9.2");
  const version = field(origin, "MSH.12.1");

  return m(
    s(
      "MSH",
      f(delimiters.field),
      f(
        `${delimiters.component}${delimiters.repetition}${delimiters.escape}${delimiters.subcomponent}`
      ),
      sending ? f(sending.application) : copy(origin, "MSH.5"),
      sending ? f(sending.facility) : copy(origin, "MSH.6"),
      copy(origin, "MSH.3"),
      copy(origin, "MSH.4"),
      f(formatDTM(nowDTM({ precision: Precision.Second, timeZone }))),
      f(""),
      messageType(triggerEvent, version),
      f(options.id ?? uid()),
      options.processingId === undefined && field(origin, "MSH.11")
        ? copy(origin, "MSH.11")
        : f(options.processingId ?? DEFAULT_PROCESSING_ID),
      f(version)
    ),
    s("MSA", f(code), f(field(origin, "MSH.10")))
  );
}

/**
 * MSH-9 of the acknowledgment. MSH-9.3 exists from v2.3.1; a blank or
 * unreadable version gets it too.
 */
// TODO(#1112): remove this version check once a profile transform conforms
// the acknowledgment to MSH-12 (#1084).
// https://github.com/rethinkhealth/glion/issues/1112
function messageType(triggerEvent: string, version: string): Field {
  if (!valid(version) || gte(version, "2.3.1")) {
    return f(c("ACK"), c(triggerEvent), c("ACK"));
  }
  return triggerEvent ? f(c("ACK"), c(triggerEvent)) : f("ACK");
}

function field(origin: Root, path: string): string {
  return value(origin, path)?.value ?? "";
}

/** The field at `path`, copied with {@link copyField}, or an empty field. */
function copy(origin: Root, path: string): Field {
  const node = select(origin, path)?.node as Field | undefined;
  return node ? copyField(node) : f("");
}

/** `node` rebuilt from its values: no `data`, no `position`. */
export function copyField(node: Field): Field {
  return {
    children: node.children.map((repetition) => ({
      children: repetition.children.map((component) => ({
        children: component.children.map((subcomponent) => ({
          type: "subcomponent",
          value: subcomponent.value,
        })),
        type: "component",
      })),
      type: "field-repetition",
    })),
    type: "field",
  };
}
