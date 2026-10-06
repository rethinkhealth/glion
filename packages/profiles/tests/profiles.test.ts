import { profiles } from "../src/profiles";
import { codeSystems } from "../src/stores/code-systems";
import { datatypes } from "../src/stores/datatypes";
import { events } from "../src/stores/events";
import { fields } from "../src/stores/fields";
import { tables } from "../src/stores/tables";

describe("profiles", () => {
  it("holds each store", () => {
    expect(profiles.events).toBe(events);
    expect(profiles.fields).toBe(fields);
    expect(profiles.datatypes).toBe(datatypes);
    expect(profiles.tables).toBe(tables);
    expect(profiles.codeSystems).toBe(codeSystems);
  });
});
