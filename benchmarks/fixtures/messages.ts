/**
 * Canonical message fixtures — the shared vocabulary of the benchmark suite.
 *
 * Suites draw inputs from here so numbers are comparable across suites; a
 * fixture lives here once two suites (or a suite and the canary) need it,
 * otherwise it stays local to its suite. Profile-aware tree fixtures pin
 * HL7 v2.5 — keep them on one version or cross-rule numbers stop being
 * comparable.
 */
import { c, f, m, r, s } from "@glion/builder";

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

// ---------------------------------------------------------------------------
// Builder trees
// ---------------------------------------------------------------------------

/** MSH + EVN + PID + N minimal OBX — the lint-profile scaling shape. */
export function lintAdtTree(obxCount: number) {
  const segments = [msh(), evn(), validPid()];
  for (let i = 1; i <= obxCount; i++) {
    segments.push(obx(i));
  }
  return m(...segments);
}

/** MSH + PID + N coded OBX — the annotate-profile scaling shape. */
export function annotateAdtTree(obxCount: number) {
  const segments = [msh(), pid()];
  for (let i = 1; i <= obxCount; i++) {
    segments.push(obxCoded(i));
  }
  return m(...segments);
}

/**
 * Three segments, multiple guaranteed lint violations: EVN table violation,
 * PID maxLength + repetition, required field empty.
 */
export function lintViolationsTree() {
  return m(
    msh(),
    s("EVN", f("ZZZ")),
    s("PID", f(r("12345"), r("67890")), f(""), f(""), f(""), f("Doe"))
  );
}

// ---------------------------------------------------------------------------
// Raw HL7v2 text (pipeline suite, canary)
// ---------------------------------------------------------------------------

export const ADT_A01_SMALL = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20241201120000",
  "PID|1||12345^^^MRN||Doe^John^Q||19800101|M|||123 Main St^^Springfield^IL^62701",
].join("\r");

export const ORU_R01_MEDIUM = [
  "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG002|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John^Q||19800101|M",
  "ORC|RE|ORD001|LAB001",
  "OBR|1|ORD001|LAB001|CBC^Complete Blood Count|||20241201",
  ...Array.from(
    { length: 10 },
    (_, i) =>
      `OBX|${i + 1}|NM|WBC-${i}^White Blood Cell||${(5 + i * 0.3).toFixed(1)}|10*9/L|4.5-11.0|N|||F`
  ),
].join("\r");

/** MSH + PID + PV1 + ORC + OBR + N OBX. */
export function buildOruMessage(obxCount: number): string {
  const segments = [
    "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG003|P|2.5.1",
    "PID|1||12345^^^MRN||Doe^John^Q^^Dr||19800101|M|||123 Main St^^Springfield^IL^62701^USA",
    "PV1|1|I|ICU^101^A",
    "ORC|RE|ORD001|LAB001",
    "OBR|1|ORD001|LAB001|CBC^Complete Blood Count|||20241201",
  ];
  for (let i = 1; i <= obxCount; i++) {
    segments.push(
      `OBX|${i}|NM|8302-${i}^Test${i}^LN||${(100 + i * 0.5).toFixed(1)}|mg/dL|50-200|N|||F`
    );
  }
  return segments.join("\r");
}

// ---------------------------------------------------------------------------
// Raw HL7v2 text (MLLP suites: codec, handle, client)
// ---------------------------------------------------------------------------

export const MLLP_SMALL_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

/** ORU with 50 OBR/OBX pairs (~102 segments). Values fixed — never random. */
export const MLLP_LARGE_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ORU^R01^ORU_R01|MSG002|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John^Q^^^^L||19800101|M|||123 Main St^^Springfield^IL^62704^USA",
  ...Array.from({ length: 50 }, (_, i) => [
    `OBR|${i + 1}||LAB${String(i).padStart(4, "0")}|CBC^Complete Blood Count`,
    `OBX|1|NM|WBC^White Blood Cell Count||${(5 + (i % 10)).toFixed(1)}|10*9/L|4.5-11.0|N|||F`,
  ]).flat(),
].join("\r");
