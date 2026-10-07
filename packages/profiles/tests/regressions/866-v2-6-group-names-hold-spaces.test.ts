/**
 * Regression for https://github.com/rethinkhealth/glion/issues/866.
 *
 * Date: 2026-10-07
 * Symptom: twelve group names in nine v2.6 event schemas held a space or a
 * `/`, such as `PATIENT VISIT` in REF_I12, so no `@glion/util-query` path
 * could name the group a grouped tree carried.
 * Cause: the v2.6 XML schemas spell these groups with a space, where v2.5.1
 * and v2.7 spell them with `_`, and the generator copied the name.
 * Resolution: the generator spells a space or a `/` in a group name as `_`
 * and rejects any other group name outside `[A-Z][A-Z0-9_]*`; the event
 * schema JSON Schema, which the build checks every bundled schema against,
 * requires that pattern.
 */

import { describe, expect, it } from "vitest";

import type { EventSchema, EventSchemaElement } from "../../src/engine/types";
import { events } from "../../src/stores/events";

// Every group name in `elements`, in document order.
const groupNames = (elements: readonly EventSchemaElement[]): string[] => {
  const names: string[] = [];
  for (const element of elements) {
    switch (element.type) {
      case "segment": {
        break;
      }
      case "group": {
        names.push(element.name, ...groupNames(element.elements));
        break;
      }
      case "choice": {
        names.push(...groupNames(element.alternatives));
        break;
      }
    }
  }
  return names;
};

const load = async (id: string): Promise<EventSchema> => {
  const schema = await events.load("2.6", id);
  if (!schema) {
    throw new Error(`v2.6 ${id} is not bundled`);
  }
  return schema;
};

describe("v2.6 group names", () => {
  it("spell REF_I12's patient visit PATIENT_VISIT, as v2.5.1 does", async () => {
    const { elements } = await load("REF_I12");

    expect(groupNames(elements)).toContain("PATIENT_VISIT");
  });

  it("spell EHC_E10's product/service line PRODUCT_SERVICE_LINE_INFO, as v2.7 does", async () => {
    const { elements } = await load("EHC_E10");

    expect(groupNames(elements)).toContain("PRODUCT_SERVICE_LINE_INFO");
  });

  it("hold only uppercase letters, digits, and underscores in the nine schemas that held a space", async () => {
    const names: string[] = [];
    for (const id of [
      "DFT_P03",
      "DFT_P11",
      "EHC_E10",
      "OPL_O37",
      "REF_I12",
      "RRI_I12",
      "RSP_Z86",
      "SRM_S01",
      "SRR_S01",
    ]) {
      const { elements } = await load(id);
      names.push(...groupNames(elements));
    }

    expect(names.filter((name) => !/^[A-Z][A-Z0-9_]*$/.test(name))).toEqual([]);
  });
});
