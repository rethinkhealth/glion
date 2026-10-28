/**
 * Canonical benchmark fixtures — the shared vocabulary of the suite.
 *
 * HL7v2 text is the single canonical form: named messages live as .hl7
 * files in ./messages (loaded via {@link hl7File}), and scale comes from
 * composing per-index line builders with {@link repeat} —
 * `` `${BASE}${hl7(...repeat(obxLine, 50))}` ``. Tree suites parse
 * the text with `parseHL7v2`, exactly as production pipelines do; nothing
 * here hand-builds ASTs.
 *
 * Files and constants are named for what the message IS — its event,
 * version, and distinguishing property (sparse, coded, violations) —
 * never for the suite that consumes it. A fixture lives here once two
 * suites (or a suite and the canary) need it; single-suite shapes stay
 * local. Profile-aware fixtures pin HL7 v2.5 — keep them on one version
 * or cross-rule numbers stop being comparable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = join(import.meta.dirname, "messages");

/** Read a canonical .hl7 message by basename. */
export function hl7File(name: string): string {
  return readFileSync(join(MESSAGES_DIR, `${name}.hl7`), "utf8");
}

/**
 * Build `count` items with a 1-based index: `hl7(BASE, ...repeat(obxLine,
 * 50))`.
 */
export function repeat<T>(build: (index: number) => T, count: number): T[] {
  return Array.from({ length: count }, (_, i) => build(i + 1));
}

/** The HL7v2 message `segments` make, each followed by the segment terminator. */
export function hl7(...segments: string[]): string {
  return segments.map((segment) => `${segment}\r`).join("");
}

// ---------------------------------------------------------------------------
// Per-index segment lines (compose with repeat)
// ---------------------------------------------------------------------------

/** Sparse OBX: bare code, most fields empty. */
export function obxLine(index: number): string {
  return `OBX|${index}|NM|8302-2||185|cm`;
}

/** Coded OBX: CWE observation id and UCUM units. */
export function obxCodedLine(index: number): string {
  return `OBX|${index}|NM|8302-2^Body Height^LN||185|cm^Centimeter^UCUM`;
}

/** Text OBX whose value holds escape sequences for every delimiter. */
export function obxEscapedLine(index: number): string {
  return `OBX|${index}|TX|NOTE||Result ${index} holds \\F\\ and \\S\\ and \\R\\ and \\T\\ and \\E\\ chars||||||F`;
}

/** Numbered result OBX for the scaling ORU. */
export function oruObx(index: number): string {
  return `OBX|${index}|NM|8302-${index}^Test${index}^LN||${(100 + index * 0.5).toFixed(1)}|mg/dL|50-200|N|||F`;
}

// ---------------------------------------------------------------------------
// ADT^A01 messages — same event, four distinguishing shapes
// ---------------------------------------------------------------------------

/** V2.5.1, 3 segments, populated PID (MRN, name suffix, address). */
export const ADT_A01_SMALL = hl7File("adt-a01-small");

/** V2.5.1, 3 segments, minimal PID — the leanest complete ADT. */
export const ADT_A01_MINIMAL = hl7File("adt-a01-minimal");

// v2.5, mostly-empty fields (adt-a01-sparse.hl7) — extend with sparse OBX
// lines: `${hl7File("adt-a01-sparse")}${hl7(...repeat(obxLine, N))}`.
// v2.5, CWE-coded fields (adt-a01-coded.hl7) — extend with obxCodedLine.
// v2.5, guaranteed profile violations (adt-a01-violations.hl7): EVN-1
// outside table 0003, PID-1 repetition + maxLength, required fields empty.

// ---------------------------------------------------------------------------
// ORU^R01 messages
// ---------------------------------------------------------------------------

/** V2.5.1, 14 segments: one order, ten results. */
export const ORU_R01_MEDIUM = hl7File("oru-r01-medium");

/**
 * Header for the scaling ORU: compose as `hl7(...ORU_R01_HEADER,
 * ...repeat(oruObx, N))`.
 */
export const ORU_R01_HEADER = [
  "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG003|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John^Q^^Dr||19800101|M|||123 Main St^^Springfield^IL^62701^USA",
  "PV1|1|I|ICU^101^A",
  "ORC|RE|ORD001|LAB001",
  "OBR|1|ORD001|LAB001|CBC^Complete Blood Count|||20241201",
];

/** V2.5.1, 50 OBR/OBX pairs (~102 segments). Values fixed — never random. */
export const ORU_R01_LARGE = hl7(
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ORU^R01^ORU_R01|MSG002|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John^Q^^^^L||19800101|M|||123 Main St^^Springfield^IL^62704^USA",
  ...repeat(
    (i) => [
      `OBR|${i}||LAB${String(i - 1).padStart(4, "0")}|CBC^Complete Blood Count`,
      `OBX|1|NM|WBC^White Blood Cell Count||${(5 + ((i - 1) % 10)).toFixed(1)}|10*9/L|4.5-11.0|N|||F`,
    ],
    50
  ).flat()
);
