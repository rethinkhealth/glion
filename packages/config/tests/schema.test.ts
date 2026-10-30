import { DEFAULT_DELIMITERS } from "@glion/utils";

import { HL7v2ConfigSchema } from "../src/schema";

const DEFAULT_SETTINGS = {
  delimiters: DEFAULT_DELIMITERS,
};

describe("hL7v2Config schema", () => {
  describe("defaults", () => {
    it("should apply default settings for empty config", () => {
      const result = HL7v2ConfigSchema.parse({});
      expect(result.settings).toStrictEqual(DEFAULT_SETTINGS);
    });

    it("should accept config with $schema", () => {
      const result = HL7v2ConfigSchema.parse({
        $schema:
          "https://raw.githubusercontent.com/rethinkhealth/hl7v2/main/packages/hl7v2-config/schema.json",
      });
      expect(result.settings).toStrictEqual(DEFAULT_SETTINGS);
    });
  });

  describe("plugins", () => {
    it("should accept string plugins", () => {
      const result = HL7v2ConfigSchema.parse({
        plugins: ["preset-lint-recommended"],
      });
      expect(result.plugins).toStrictEqual(["preset-lint-recommended"]);
    });

    it("should accept plugins with options", () => {
      const result = HL7v2ConfigSchema.parse({
        plugins: [["lint-max-message-size", { maxBytes: 5_000_000 }]],
      });
      expect(result.plugins).toHaveLength(1);
    });

    it("should reject non-array plugins", () => {
      const result = HL7v2ConfigSchema.safeParse({ plugins: "not-an-array" });
      expect(result.success).toBeFalsy();
    });
  });

  describe("settings.delimiters", () => {
    it("should accept valid single-character delimiters", () => {
      const delimiters = {
        component: "*",
        escape: "\\",
        field: "@",
        repetition: "!",
        subcomponent: "#",
      };
      const result = HL7v2ConfigSchema.parse({
        settings: { delimiters },
      });
      expect(result.settings.delimiters).toStrictEqual(delimiters);
    });

    it("rejects a segment delimiter: HL7v2 fixes the segment terminator as a carriage return", () => {
      const result = HL7v2ConfigSchema.safeParse({
        settings: { delimiters: { segment: "\n" } },
      });
      expect(result.success).toBeFalsy();
    });

    it("should accept partial delimiter overrides", () => {
      const result = HL7v2ConfigSchema.parse({
        settings: { delimiters: { component: "@", field: "#" } },
      });
      expect(result.settings.delimiters?.field).toBe("#");
      expect(result.settings.delimiters?.component).toBe("@");
      expect(result.settings.delimiters).toStrictEqual({
        ...DEFAULT_DELIMITERS,
        component: "@",
        field: "#",
      });
    });

    it("should default to DEFAULT_DELIMITERS when not specified", () => {
      const result = HL7v2ConfigSchema.parse({});
      expect(result.settings.delimiters).toStrictEqual(DEFAULT_DELIMITERS);
    });

    it.each([
      ["multi-character", { field: "||" }],
      ["empty string", { field: "" }],
    ])("should reject %s delimiter", (_, delimiters) => {
      const result = HL7v2ConfigSchema.safeParse({
        settings: { delimiters },
      });
      expect(result.success).toBeFalsy();
    });
  });

  describe("full config", () => {
    it("should accept complete valid config", () => {
      const result = HL7v2ConfigSchema.parse({
        $schema:
          "https://raw.githubusercontent.com/rethinkhealth/hl7v2/main/packages/hl7v2-config/schema.json",
        plugins: [
          "preset-lint-recommended",
          ["lint-max-message-size", { maxBytes: 5_000_000 }],
        ],
        settings: {
          delimiters: {
            component: "^",
            escape: "\\",
            field: "|",
            repetition: "~",
            subcomponent: "&",
          },
        },
      });
      expect(result.plugins).toHaveLength(2);
      expect(result.settings.delimiters?.field).toBe("|");
    });
  });

  describe("validation errors", () => {
    it("should reject invalid $schema (not a URL)", () => {
      const result = HL7v2ConfigSchema.safeParse({ $schema: "not-a-url" });
      expect(result.success).toBeFalsy();
    });

    it("should reject unknown settings properties", () => {
      const result = HL7v2ConfigSchema.safeParse({
        settings: { unknownProperty: "value" },
      });
      expect(result.success).toBeFalsy();
    });

    it("should reject unknown delimiter properties", () => {
      const result = HL7v2ConfigSchema.safeParse({
        settings: { delimiters: { unknownDelimiter: "*" } },
      });
      expect(result.success).toBeFalsy();
    });
  });
});
