/**
 * Canonical benchmark fixtures — the shared vocabulary of the suite.
 *
 * HL7v2 text is the single canonical form: named messages live as .hl7
 * files in ./messages (loaded via {@link hl7File}, newlines normalized to
 * CR), and scale comes from composing per-index line builders with
 * {@link repeat} — `hl7(BASE, ...repeat(obxLine, 50))`. Tree suites parse
 * the text with `parseHL7v2`, exactly as production pipelines do; nothing
 * here hand-builds ASTs. A fixture lives here once two suites (or a suite
 * and the canary) need it; single-suite shapes stay local. Profile-aware
 * fixtures pin HL7 v2.5 — keep them on one version or cross-rule numbers
 * stop being comparable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = join(import.meta.dirname, "messages");

/** Read a canonical .hl7 message by basename; newlines normalized to CR. */
export function hl7File(name: string): string {
  return readFileSync(join(MESSAGES_DIR, `${name}.hl7`), "utf8")
    .replaceAll("\r\n", "\r")
    .replaceAll("\n", "\r")
    .replace(/\r+$/, "");
}

/**
 * Build `count` items with a 1-based index: `hl7(BASE, ...repeat(obxLine,
 * 50))`.
 */
export function repeat<T>(build: (index: number) => T, count: number): T[] {
  return Array.from({ length: count }, (_, i) => build(i + 1));
}

/** Join segments (or whole message parts) into one HL7v2 message (CR-separated). */
export function hl7(...segments: string[]): string {
  return segments.join("\r");
}

// ---------------------------------------------------------------------------
// Per-index segment lines (compose with repeat)
// ---------------------------------------------------------------------------

/** Minimal OBX (lint suites): sparse fields, bare code. */
export function obxLine(index: number): string {
  return `OBX|${index}|NM|8302-2||185|cm`;
}

/** OBX with fully coded CWE observation id and UCUM units (annotate suites). */
export function obxCodedLine(index: number): string {
  return `OBX|${index}|NM|8302-2^Body Height^LN||185|cm^Centimeter^UCUM`;
}

/** Numbered OBX line for the scaling ORU. */
export function oruObx(index: number): string {
  return `OBX|${index}|NM|8302-${index}^Test${index}^LN||${(100 + index * 0.5).toFixed(1)}|mg/dL|50-200|N|||F`;
}

// ---------------------------------------------------------------------------
// Canonical messages
// ---------------------------------------------------------------------------

export const ADT_A01_SMALL = hl7File("adt-a01-small");

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

export const MLLP_SMALL_MESSAGE = hl7File("mllp-adt-a01");

/** ORU with 50 OBR/OBX pairs (~102 segments). Values fixed — never random. */
export const MLLP_LARGE_MESSAGE = hl7(
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
