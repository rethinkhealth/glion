// oxlint-disable-next-line no-unused-vars -- triggers FieldRepetitionData, ComponentData and SubcomponentData augmentation
import type { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import type {
  Component,
  FieldRepetition,
  Root,
  Subcomponent,
} from "@glion/ast";
import type { ParseResult, TimestampIssue } from "@glion/util-timestamp";
import { parseDT, parseDTM, parseTM } from "@glion/util-timestamp";
import { visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";

const messages = {
  dayOutOfRange:
    "The day is past the end of its month; a date must name a day its month has.",
  hourOutOfRange: "The hour is out of range; an hour is `00` to `23`.",
  invalidDT: "The value is not a date; a DT value has the form `YYYY[MM[DD]]`.",
  invalidDTM:
    "The value is not a date and time; a DTM value has the form `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`.",
  invalidTM:
    "The value is not a time; a TM value has the form `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`.",
  minuteOutOfRange: "The minute is out of range; a minute is `00` to `59`.",
  monthOutOfRange: "The month is out of range; a month is `01` to `12`.",
  offsetOutOfRange:
    "The offset is out of range; an offset is at most 14 hours, with minutes `00` to `59`.",
  secondOutOfRange: "The second is out of range; a second is `00` to `59`.",
} as const;

/** `""`, the explicit null HL7v2 sends to delete a value. */
const EXPLICIT_NULL = '""';

type Datatype = "DT" | "TM" | "DTM";

type Primitive = FieldRepetition | Component | Subcomponent;

/**
 * The date and time datatype of a primitive node, from `data.datatypeId`, or
 * `undefined` when it holds no date or time.
 *
 * TS.1 is read as DTM in every version, though v2.2 to v2.4 type it ST. A
 * primitive TS, as in v2.1, is read as DTM.
 */
function datatypeOf(node: Primitive): Datatype | undefined {
  const data = node.data;
  if (data?.kind !== "primitive") {
    return undefined;
  }
  // TS (Time Stamp) by version, as the standard prints its component table:
  //   v2.1        primitive; the field is the time stamp
  //   v2.2–v2.4   composite; TS.1 "time of an event" is typed ST
  //   v2.5        composite; TS.1 "Time" is typed DTM
  //   v2.6+       withdrawn; the fields it typed are DTM
  // In v2.2 to v2.4 the type says string, but TS.1 holds a time stamp in the
  // form v2.5 names DTM. It is matched by its row, so a v2.3 PID-7.1 is
  // checked like a v2.5 one. TS.1 is a subcomponent when the TS sits inside a
  // composite (XCN.19 Effective Date in PV1-7 is PV1-7.19.1), and carries the
  // same `id`. TS.2, the degree of precision (table 0529), is a code and is not
  // matched.
  // Stryker disable next-line ConditionalExpression,StringLiteral,OptionalChaining: equivalent; a field repetition carries no `id`, and `data` is set once `kind` is "primitive"
  if (node.type !== "field-repetition" && node.data?.id === "TS.1") {
    return "DTM";
  }
  switch (data.datatypeId) {
    // DT and TM are primitives in every version. DTM is TS.1 in v2.5 and the
    // field's own datatype from v2.6.
    case "DT":
    case "TM":
    case "DTM": {
      return data.datatypeId;
    }
    // Only v2.1 reaches here: from v2.2 to v2.5 a TS is composite, so its node
    // is not primitive and its value is read from TS.1 above.
    case "TS": {
      return "DTM";
    }
    // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent; without the arm the function still returns undefined
    default: {
      return undefined;
    }
  }
}

/**
 * The value of a primitive node: its first subcomponent.
 *
 * Components and subcomponents a primitive datatype does not define are
 * ignored, as HL7v2 tells the recipient to ignore "components, subcomponents,
 * and extra repetitions of a field that are present but were not expected".
 */
function primitiveValue(node: Primitive): string | undefined {
  switch (node.type) {
    case "field-repetition": {
      return node.children[0]?.children[0]?.value;
    }
    case "component": {
      return node.children[0]?.value;
    }
    case "subcomponent": {
      return node.value;
    }
  }
}

function parse(datatype: Datatype, value: string): ParseResult<unknown> {
  switch (datatype) {
    case "DT": {
      return parseDT(value);
    }
    case "TM": {
      return parseTM(value);
    }
    case "DTM": {
      return parseDTM(value);
    }
  }
}

function invalidFormat(datatype: Datatype): string {
  switch (datatype) {
    case "DT": {
      return messages.invalidDT;
    }
    case "TM": {
      return messages.invalidTM;
    }
    case "DTM": {
      return messages.invalidDTM;
    }
  }
}

function messageFor(datatype: Datatype, issue: TimestampIssue): string {
  switch (issue.code) {
    case "invalid-format": {
      return invalidFormat(datatype);
    }
    case "month-out-of-range": {
      return messages.monthOutOfRange;
    }
    case "day-out-of-range": {
      return messages.dayOutOfRange;
    }
    case "hour-out-of-range": {
      return messages.hourOutOfRange;
    }
    case "minute-out-of-range": {
      return messages.minuteOutOfRange;
    }
    case "second-out-of-range": {
      return messages.secondOutOfRange;
    }
    case "offset-out-of-range": {
      return messages.offsetOutOfRange;
    }
  }
}

/**
 * Lint rule that reports a DT, TM, or DTM value that is not a valid date or
 * time: one that does not follow its datatype's format, or names a month,
 * day, hour, minute, second, or offset that does not exist, such as
 * `20250229`.
 *
 * Checks every primitive field repetition, component, and subcomponent whose
 * datatype is DT, TM, or DTM, and TS.1 in every version. Empty values and
 * the explicit null `""` are not checked.
 *
 * Each finding is placed on the node that holds the value, with its
 * ancestors, and carries the value in `actual`.
 *
 * Reads `kind`, `datatypeId`, and `id` from repetition, component, and
 * subcomponent data, set by `@glion/annotate-profile-datatypes`, which MUST
 * run before it.
 *
 * @example
 *   ```typescript
 *   unified()
 *     .use(hl7v2AnnotateProfileContext)
 *     .use(hl7v2AnnotateProfileFields)
 *     .use(hl7v2AnnotateProfileDatatypes)
 *     .use(hl7v2LintTimestamps);
 *   ```;
 */
const hl7v2LintTimestamps = lintRule<Root>(
  {
    origin: "hl7v2-lint:timestamps",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-timestamps#readme",
  },
  (tree, file) => {
    visit(
      tree,
      (node): node is Primitive =>
        // Stryker disable next-line ConditionalExpression: equivalent; no other node type carries a `kind`, so `datatypeOf` rejects it
        node.type === "field-repetition" ||
        node.type === "component" ||
        node.type === "subcomponent",
      (node, ancestors) => {
        const datatype = datatypeOf(node);
        const value = primitiveValue(node);
        if (datatype === undefined || !value || value === EXPLICIT_NULL) {
          return;
        }
        const result = parse(datatype, value);
        if (result.success) {
          return;
        }
        const message = file.message(messageFor(datatype, result.issue), {
          ancestors: [...ancestors, node],
          place: node.position,
        });
        message.actual = value;
      }
    );
  }
);

export default hl7v2LintTimestamps;
