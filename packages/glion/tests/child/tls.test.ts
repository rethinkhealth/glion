import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTlsFile } from "../../src/child/tls";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-tls-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("readTlsFile", () => {
  it("returns the file contents as a Buffer when the file exists", async () => {
    const path = join(dir, "cert.pem");
    const contents = "-----BEGIN CERT-----\nfake\n-----END CERT-----\n";
    await writeFile(path, contents);

    const result = await readTlsFile(path, "tls.cert");

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("utf8")).toBe(contents);
  });

  it("throws GlionError('tls-read-failed') naming the file and the field", async () => {
    const missing = join(dir, "missing.pem");

    await expect(readTlsFile(missing, "tls.key")).rejects.toMatchObject({
      context: { field: "tls.key", path: missing },
      // The message states the file; the field the user wrote is what the
      // hint points at, so a server's `tls.key` reads differently from a
      // client's `client.tls.key`.
      hint: `Check that \`tls.key\` names a file this process can read (chmod 600 for key files).`,
      kind: "tls-read-failed",
      message: `The TLS file \`${missing}\` could not be read.`,
    });
  });

  it("preserves the underlying error as the cause", async () => {
    const missing = join(dir, "missing.pem");

    try {
      await readTlsFile(missing, "tls.cert");
      expect.fail("readTlsFile should have rejected");
    } catch (error) {
      // The original ENOENT error from fs.readFile must be preserved
      // so callers can still inspect the OS-level failure code.
      expect(error).toMatchObject({
        cause: expect.objectContaining({ code: "ENOENT" }),
        kind: "tls-read-failed",
      });
    }
  });
});
