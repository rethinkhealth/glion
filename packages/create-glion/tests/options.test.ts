import { describe, expect, it } from "vitest";

import { parseOptions } from "../src/options";

describe("parseOptions", () => {
  it("leaves every option unset when none is given", () => {
    expect(parseOptions([])).toEqual({
      dir: undefined,
      example: undefined,
      examplePath: undefined,
      help: false,
    });
  });

  it("reads the directory from the first positional argument", () => {
    expect(parseOptions(["my-app"]).dir).toBe("my-app");
  });

  it("reads an example name from --example", () => {
    expect(parseOptions(["my-app", "--example", "mllp-server"]).example).toBe(
      "mllp-server"
    );
  });

  it("reads an example name from -e", () => {
    expect(parseOptions(["-e", "mllp-server"]).example).toBe("mllp-server");
  });

  it("reads a GitHub URL from --example=", () => {
    expect(
      parseOptions(["--example=https://github.com/acme/hl7-template"]).example
    ).toBe("https://github.com/acme/hl7-template");
  });

  it("reads the template's directory from --example-path", () => {
    expect(
      parseOptions([
        "--example",
        "https://github.com/acme/templates/tree/feat/tls",
        "--example-path",
        "mllp/tls",
      ]).examplePath
    ).toBe("mllp/tls");
  });

  it("reads --help and -h", () => {
    expect(parseOptions(["--help"]).help).toBe(true);
    expect(parseOptions(["-h"]).help).toBe(true);
  });

  it("refuses --example without a value", () => {
    expect(() => parseOptions(["my-app", "--example"])).toThrow(TypeError);
  });

  it("refuses an unknown option", () => {
    expect(() => parseOptions(["--template", "starter"])).toThrow(TypeError);
  });
});
