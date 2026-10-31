/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1059.
 *
 * Date: 2026-10-20
 * Symptom: `glion dev` showed `?`, uncoloured, for a reply whose MSA-1 is
 * `CA`, `CE` or `CR`, as if no reply arrived. A reply whose field separator
 * is not `|` showed `?` whatever its code.
 * Cause: the CLI kept its own copy of HL7v2 Table 0008 with only the three
 * application-level codes, and read MSA-1 with a pattern that assumed `|` as
 * the field separator.
 * Resolution: MSA-1 is checked with `isAckCode` from `@glion/ack` and found
 * with the reply's own field separator (MSH-1); the dev view colours a code
 * with `isAckSuccessCode` and `isAckNakCode`.
 */

// oxlint-disable require-await, no-empty-function
import {
  AckApplicationError,
  AckApplicationReject,
  AckCode,
  AckCommitError,
  AckCommitReject,
} from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import type { Handler } from "@glion/mllp";
import type { NodeEnv } from "@glion/mllp/node";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { createMsgTelemetry } from "../../src/child/middlewares";
import type { Event, PartialEvent } from "../../src/events";
import { LogPane } from "../../src/tui/log-pane";

// Runs before the imports above, so chalk renders colour without a TTY.
vi.hoisted(() => {
  process.env.FORCE_COLOR = "1";
});

const GREEN = "\u001B[32m";
const RED = "\u001B[31m";

const ADT_A01 = new TextEncoder().encode(
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1\rPID|1||12345"
);

const ENV: NodeEnv = {
  connection: {
    id: 1,
    localPort: 2575,
    remoteAddress: "127.0.0.1",
    remotePort: 41_376,
    secure: false,
    state: new Map(),
  },
};

/** The msg event of a message that `handler` answers. */
async function msgEvent(handler: Handler<NodeEnv>): Promise<PartialEvent> {
  const events: PartialEvent[] = [];
  const app = new Mllp<NodeEnv>()
    .use(
      createMsgTelemetry((event) => events.push(event)),
      { prepend: true }
    )
    .on("*", handler);
  await app.handle(ADT_A01, ENV);
  const [event] = events;
  if (!event) {
    throw new Error("The telemetry middleware emitted no event.");
  }
  return event;
}

async function devRow(handler: Handler<NodeEnv>): Promise<string> {
  const event = {
    ts: "2026-10-20T12:00:00.000Z",
    ...(await msgEvent(handler)),
  } as Event;
  const { lastFrame } = render(
    <LogPane entries={[{ event, id: 1 }]} epoch={0} />
  );
  return lastFrame() ?? "";
}

describe("a reply's acknowledgment code in the dev view", () => {
  it("shows an application accept `AA` in green", async () => {
    const row = await devRow((ctx) => ctx.ack());

    expect(row).toContain(`${GREEN}AA`);
  });

  it("shows an application error `AE` in red", async () => {
    const row = await devRow(() => {
      throw new AckApplicationError("Lookup failed", {});
    });

    expect(row).toContain(`${RED}AE`);
  });

  it("shows an application reject `AR` in red", async () => {
    const row = await devRow(() => {
      throw new AckApplicationReject("Rejected", {});
    });

    expect(row).toContain(`${RED}AR`);
  });

  it("shows a commit accept `CA` in green", async () => {
    const row = await devRow((ctx) => ctx.ack({ code: AckCode.CommitAccept }));

    expect(row).toContain(`${GREEN}CA`);
  });

  it("shows a commit error `CE` in red", async () => {
    const row = await devRow(() => {
      throw new AckCommitError("Not stored", {});
    });

    expect(row).toContain(`${RED}CE`);
  });

  it("shows a commit reject `CR` in red", async () => {
    const row = await devRow(() => {
      throw new AckCommitReject("Not stored", {});
    });

    expect(row).toContain(`${RED}CR`);
  });
});

describe("a reply whose field separator is not `|`", () => {
  it("is read with the field separator its MSH-1 declares", async () => {
    const event = await msgEvent((ctx) =>
      ctx.reply(
        parseHL7v2.parse("MSH#|~\\&#######ACK#ACK1#P#2.5.1\rMSA#CA#MSG001")
      )
    );

    expect(event).toMatchObject({ ack: "CA" });
  });
});
