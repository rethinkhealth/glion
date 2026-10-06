import { describe, expect, it } from "vitest";

import type { EventSchemaElement } from "../../src/engine/types";
import { events } from "../../src/stores/events";

/** Recursively collect every group name in an event schema. */
const groupNames = (elements: readonly EventSchemaElement[]): string[] => {
  const names: string[] = [];
  for (const element of elements) {
    if (element.type === "group") {
      names.push(element.name, ...groupNames(element.elements));
    } else if (element.type === "choice") {
      names.push(...groupNames(element.alternatives));
    }
  }
  return names;
};

describe("ORS_O06 v2.4 event schema group identifiers", () => {
  it("never uses the misspelled 'RSPONSE' group identifier", async () => {
    const schema = await events.load("2.4", "ORS_O06");
    const names = groupNames(schema!.elements);
    expect(names.some((name) => name.includes("RSPONSE"))).toBe(false);
  });

  it("uses the canonical RESPONSE group with PATIENT and ORDER children", async () => {
    const schema = await events.load("2.4", "ORS_O06");
    const response = schema!.elements.find(
      (element) => element.type === "group" && element.name === "RESPONSE"
    );
    expect(response).toBeDefined();
    expect(response!.type).toBe("group");
    if (response!.type !== "group") {
      return;
    }
    const childGroups = groupNames(response!.elements);
    expect(childGroups).toContain("PATIENT");
    expect(childGroups).toContain("ORDER");
  });
});
