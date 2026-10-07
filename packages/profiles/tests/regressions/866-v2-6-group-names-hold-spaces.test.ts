/**
 * Regression for https://github.com/rethinkhealth/glion/issues/866.
 *
 * Date: 2026-10-07
 * Symptom: twelve group names in nine v2.6 event schemas held a space or a
 * `/`, such as `PATIENT VISIT` in REF_I12, so no `@glion/util-query` path
 * could name the group a grouped tree carried.
 * Cause: the v2.6 XML schemas spell these groups with a space, where v2.5.1
 * and v2.7 spell them with `_`, and the generator copied the name.
 * Resolution: a group carries an ID and a name. The generator spells a space
 * or a `/` of the name as `_` in the ID and rejects any other ID outside
 * `[A-Z][A-Z0-9_]*`; the event schema JSON Schema, which the build checks
 * every bundled schema against, requires that pattern of the ID. The name
 * keeps the standard's spelling.
 */

import { describe, expect, it } from "vitest";

import type { EventSchema, EventSchemaElement } from "../../src/engine/types";
import { events } from "../../src/stores/events";

// Every group in `elements`, in document order.
const groupsOf = (
  elements: readonly EventSchemaElement[]
): { id: string; name: string }[] => {
  const groups: { id: string; name: string }[] = [];
  for (const element of elements) {
    switch (element.type) {
      case "segment": {
        break;
      }
      case "group": {
        groups.push(
          { id: element.id, name: element.name },
          ...groupsOf(element.elements)
        );
        break;
      }
      case "choice": {
        groups.push(...groupsOf(element.alternatives));
        break;
      }
    }
  }
  return groups;
};

const load = async (id: string): Promise<EventSchema> => {
  const schema = await events.load("2.6", id);
  if (!schema) {
    throw new Error(`v2.6 ${id} is not bundled`);
  }
  return schema;
};

describe("v2.6 group IDs", () => {
  it("spell REF_I12's patient visit PATIENT_VISIT, as v2.5.1 does, and keep its name PATIENT VISIT", async () => {
    const { elements } = await load("REF_I12");

    expect(groupsOf(elements)).toContainEqual({
      id: "PATIENT_VISIT",
      name: "PATIENT VISIT",
    });
  });

  it("spell EHC_E10's product/service line PRODUCT_SERVICE_LINE_INFO, as v2.7 does, and keep its name", async () => {
    const { elements } = await load("EHC_E10");

    expect(groupsOf(elements)).toContainEqual({
      id: "PRODUCT_SERVICE_LINE_INFO",
      name: "PRODUCT/SERVICE LINE_INFO",
    });
  });

  it("hold only uppercase letters, digits, and underscores in the nine schemas that held a space", async () => {
    const ids: string[] = [];
    for (const schemaId of [
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
      const { elements } = await load(schemaId);
      ids.push(...groupsOf(elements).map(({ id }) => id));
    }

    expect(ids.filter((id) => !/^[A-Z][A-Z0-9_]*$/.test(id))).toEqual([]);
  });
});
