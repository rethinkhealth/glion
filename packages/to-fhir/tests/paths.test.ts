import { readFileSync } from "node:fs";

import type { Nodes } from "@glion/ast";
import { select } from "@glion/util-query";
import { describe, expect, it } from "vitest";

import { encloses, indexPaths, scopeSteps } from "../src/paths";
import { toTree } from "./processor";

const message = readFileSync(
  new URL("fixtures/oru-r01.hl7", import.meta.url),
  "utf8"
);
const twoNotes = readFileSync(
  new URL("fixtures/oru-r01-two-patient-notes.hl7", import.meta.url),
  "utf8"
);

describe("indexPaths", () => {
  it("qualifies a leaf path with every enclosing group instance", async () => {
    const index = indexPaths(await toTree(message));
    const family = index.leaves.find((leaf) => leaf.value === "RIVERA");

    expect(family?.path).toBe("PATIENT_RESULT[1].PATIENT[1].PID.5.1.1");
  });

  it("indexes a repeating field with its repetition number", async () => {
    const index = indexPaths(await toTree(message));
    const identifiers = index.leaves
      .filter((leaf) => leaf.segment === "PID" && leaf.sequence === 3)
      .map((leaf) => leaf.path);

    expect(identifiers).toContain("PATIENT_RESULT[1].PATIENT[1].PID.3[1].1.1");
    expect(identifiers).toContain("PATIENT_RESULT[1].PATIENT[1].PID.3[2].1.1");
  });

  it("omits the repetition number from a field that has only one", async () => {
    const index = indexPaths(await toTree(message));
    const birthDate = index.leaves.find((leaf) => leaf.value === "19781103");

    expect(birthDate?.path).toBe("PATIENT_RESULT[1].PATIENT[1].PID.7.1.1");
  });

  it("names a group instance for every path a schema can scope to", async () => {
    const index = indexPaths(await toTree(message));

    expect([...index.scopes.keys()]).toStrictEqual([
      "",
      "PATIENT_RESULT",
      "PATIENT_RESULT.PATIENT",
      "PATIENT_RESULT.PATIENT.VISIT",
      "PATIENT_RESULT.ORDER_OBSERVATION",
      "PATIENT_RESULT.ORDER_OBSERVATION.OBSERVATION",
    ]);
  });

  it("indexes a subcomponent that carries no value as no leaf", async () => {
    const index = indexPaths(await toTree(message));
    const empty = index.leaves.filter((leaf) => leaf.value === "");

    expect(empty).toStrictEqual([]);
  });

  it("gives every node above a leaf a path of its own", async () => {
    const tree = await toTree(message);
    const index = indexPaths(tree);
    const at = (path: string) => {
      const hit = select(tree, path as never) as { node: Nodes } | null;
      return hit && index.pathOf(hit.node);
    };

    expect(at("PATIENT_RESULT[1].PATIENT[1].PID")).toBe(
      "PATIENT_RESULT[1].PATIENT[1].PID"
    );
    expect(at("PATIENT_RESULT[1].PATIENT[1].PID.5")).toBe(
      "PATIENT_RESULT[1].PATIENT[1].PID.5"
    );
    expect(at("PATIENT_RESULT[1].PATIENT[1].PID.5.1")).toBe(
      "PATIENT_RESULT[1].PATIENT[1].PID.5.1"
    );
  });

  it("gives a group instance the path its scope is keyed by", async () => {
    const index = indexPaths(await toTree(message));
    const visit = index.scopes.get("PATIENT_RESULT.PATIENT.VISIT")?.[0];

    expect(visit?.path).toBe("PATIENT_RESULT[1].PATIENT[1].VISIT[1]");
    expect(visit && index.pathOf(visit.node)).toBe(visit?.path);
  });

  it("numbers a Segment ID that appears twice in one group instance", async () => {
    const index = indexPaths(await toTree(twoNotes));
    const notes = index.leaves
      .filter((leaf) => leaf.segment === "NTE" && leaf.sequence === 3)
      .map((leaf) => leaf.path);

    expect(notes).toStrictEqual([
      "PATIENT_RESULT[1].PATIENT[1].NTE[1].3.1.1",
      "PATIENT_RESULT[1].PATIENT[1].NTE[2].3.1.1",
    ]);
  });

  it("carries the field name the profile publishes", async () => {
    const index = indexPaths(await toTree(message));
    const sex = index.leaves.find((leaf) => leaf.value === "F");

    expect(sex?.name).toBe("Administrative Sex");
  });
});

describe("scopeSteps", () => {
  it("reads the message itself as no steps", () => {
    expect(scopeSteps("")).toStrictEqual([]);
  });

  it("reads a group instance path step by step", () => {
    expect(scopeSteps("PATIENT_RESULT[1].ORDER_OBSERVATION[2]")).toStrictEqual([
      { name: "PATIENT_RESULT", repetition: 1 },
      { name: "ORDER_OBSERVATION", repetition: 2 },
    ]);
  });
});

describe("encloses", () => {
  it("holds for the message over every group instance", () => {
    expect(encloses("", "PATIENT_RESULT[1].PATIENT[1]")).toBe(true);
  });

  it("holds for a group instance over itself", () => {
    expect(encloses("PATIENT_RESULT[1]", "PATIENT_RESULT[1]")).toBe(true);
  });

  it("holds for a group instance over one nested inside it", () => {
    expect(
      encloses(
        "PATIENT_RESULT[1].PATIENT[1]",
        "PATIENT_RESULT[1].PATIENT[1].VISIT[1]"
      )
    ).toBe(true);
  });

  it("fails between two instances of the same group", () => {
    expect(
      encloses(
        "PATIENT_RESULT[1].ORDER_OBSERVATION[1]",
        "PATIENT_RESULT[1].ORDER_OBSERVATION[2]"
      )
    ).toBe(false);
  });

  it("compares a repetition number as a number, not as text", () => {
    expect(
      encloses(
        "PATIENT_RESULT[1].OBSERVATION[1]",
        "PATIENT_RESULT[1].OBSERVATION[10]"
      )
    ).toBe(false);
  });

  it("fails between two different groups at the same depth", () => {
    expect(
      encloses(
        "PATIENT_RESULT[1].PATIENT[1]",
        "PATIENT_RESULT[1].ORDER_OBSERVATION[1]"
      )
    ).toBe(false);
  });

  it("fails for a group instance deeper than the one it is tested against", () => {
    expect(
      encloses(
        "PATIENT_RESULT[1].PATIENT[1].VISIT[1]",
        "PATIENT_RESULT[1].PATIENT[1]"
      )
    ).toBe(false);
  });
});
