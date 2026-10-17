import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadTls } from "../../src/commands/send-tls";

describe("loadTls", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("passes booleans and absence through", async () => {
    expect(await loadTls()).toBeUndefined();
    expect(await loadTls(true)).toBe(true);
    expect(await loadTls(false)).toBe(false);
  });

  it("reads each named file and keeps the other settings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-tls-"));
    dirs.push(dir);
    await writeFile(join(dir, "ca.pem"), "CA");
    await writeFile(join(dir, "c.pem"), "CERT");
    await writeFile(join(dir, "c.key"), "KEY");

    const options = await loadTls({
      ca: join(dir, "ca.pem"),
      cert: join(dir, "c.pem"),
      key: join(dir, "c.key"),
      passphrase: "p",
      rejectUnauthorized: true,
      servername: "mllp.test",
    });

    expect(options).toEqual({
      ca: Buffer.from("CA"),
      cert: Buffer.from("CERT"),
      key: Buffer.from("KEY"),
      passphrase: "p",
      rejectUnauthorized: true,
      servername: "mllp.test",
    });
  });

  it("names the file it could not read", async () => {
    await expect(loadTls({ ca: "/no/such/ca.pem" })).rejects.toMatchObject({
      kind: "tls-read-failed",
      message: "Failed to read the TLS ca file at /no/such/ca.pem",
    });
  });
});
