/**
 * Canonical benchmark fixtures — the shared vocabulary of the suite.
 *
 * The corpus exports primitives, not finished shapes: segment builders,
 * per-index line builders, and the `repeat` / `hl7` combinators. Suites
 * compose their fixtures inline — `m(msh(), pid(), ...repeat(obx, 50))` —
 * so a bench's input shape is readable at the bench site. A fixture lives
 * here once two suites (or a suite and the canary) need it; single-suite
 * shapes stay local. Profile-aware tree fixtures pin HL7 v2.5 — keep them
 * on one version or cross-rule numbers stop being comparable.
 */
import { c, f, r, s } from "@glion/builder";

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

/** Build `count` items with a 1-based index: `m(msh(), ...repeat(obx, 50))`. */
export function repeat<T>(build: (index: number) => T, count: number): T[] {
  return Array.from({ length: count }, (_, i) => build(i + 1));
}

/** Join segment lines into an HL7v2 message (CR-separated). */
export function hl7(...segments: string[]): string {
  return segments.join("\r");
}

// ---------------------------------------------------------------------------
// Builder segments (profile suites: lint-profile, annotate-profile)
// ---------------------------------------------------------------------------

/** Complete MSH with all required fields; ADT^A01, version 2.5. */
export function msh() {
  return s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(""),
    f(c("ADT"), c("A01"), c("ADT_A01")),
    f("MSG001"),
    f("P"),
    f("2.5")
  );
}

/** PID satisfying the required-fields rules. */
export function validPid() {
  return s(
    "PID",
    f("1"),
    f(""),
    f("12345"),
    f(""),
    f("Doe^John"),
    f(""),
    f(""),
    f("M")
  );
}

/** PID with CWE-shaped name components (annotate suites). */
export function pid() {
  return s(
    "PID",
    f("1"),
    f(""),
    f("12345"),
    f(""),
    f(c("Doe"), c("John"), c("M")),
    f(""),
    f("19800101"),
    f("F")
  );
}

/** EVN with a valid event code. */
export function evn() {
  return s("EVN", f("A01"), f("20241201120000"));
}

/** Minimal OBX (lint suites). */
export function obx(index: number) {
  return s(
    "OBX",
    f(String(index)),
    f("NM"),
    f(c("8302-2")),
    f(""),
    f("185"),
    f("cm")
  );
}

/** OBX with fully coded CWE observation id and UCUM units (annotate suites). */
export function obxCoded(index: number) {
  return s(
    "OBX",
    f(String(index)),
    f("NM"),
    f(c("8302-2"), c("Body Height"), c("LN")),
    f(""),
    f("185"),
    f(c("cm"), c("Centimeter"), c("UCUM"))
  );
}

/** EVN with a table violation (EVN-1 not in table 0003). */
export function evnInvalid() {
  return s("EVN", f("ZZZ"));
}

/** PID with maxLength + repetition violations and required fields empty. */
export function pidInvalid() {
  return s("PID", f(r("12345"), r("67890")), f(""), f(""), f(""), f("Doe"));
}

// ---------------------------------------------------------------------------
// Raw HL7v2 text (pipeline suite, canary)
// ---------------------------------------------------------------------------

export const ADT_A01_SMALL = hl7(
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20241201120000",
  "PID|1||12345^^^MRN||Doe^John^Q||19800101|M|||123 Main St^^Springfield^IL^62701"
);

export const ORU_R01_MEDIUM = hl7(
  "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG002|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John^Q||19800101|M",
  "ORC|RE|ORD001|LAB001",
  "OBR|1|ORD001|LAB001|CBC^Complete Blood Count|||20241201",
  ...repeat(
    (i) =>
      `OBX|${i}|NM|WBC-${i - 1}^White Blood Cell||${(5 + (i - 1) * 0.3).toFixed(1)}|10*9/L|4.5-11.0|N|||F`,
    10
  )
);

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

/** Numbered OBX line for the scaling ORU. */
export function oruObx(index: number): string {
  return `OBX|${index}|NM|8302-${index}^Test${index}^LN||${(100 + index * 0.5).toFixed(1)}|mg/dL|50-200|N|||F`;
}

// ---------------------------------------------------------------------------
// Raw HL7v2 text (MLLP suites: codec, handle, client)
// ---------------------------------------------------------------------------

export const MLLP_SMALL_MESSAGE = hl7(
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John"
);

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
