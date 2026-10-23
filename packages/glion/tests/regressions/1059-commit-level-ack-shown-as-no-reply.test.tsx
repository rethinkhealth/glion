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
import type { Context } from "@glion/mllp";
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

async function msgEvent(raw: string): Promise<PartialEvent> {
  const events: PartialEvent[] = [];
  const ctx = {
    controlId: "MSG001",
    env: {
      connection: {
        id: 1,
        localPort: 2575,
        remoteAddress: "127.0.0.1",
        remotePort: 41_376,
        secure: false,
        state: new Map(),
      },
    },
    messageType: "ADT",
    res: undefined,
    triggerEvent: "A01",
  } as unknown as Context;
  await createMsgTelemetry((event) => events.push(event))(ctx, async () => {
    ctx.res = { raw };
  });
  const [event] = events;
  if (!event) {
    throw new Error("The telemetry middleware emitted no event.");
  }
  return event;
}

async function devRow(raw: string): Promise<string> {
  const event = {
    ts: "2026-10-20T12:00:00.000Z",
    ...(await msgEvent(raw)),
  } as Event;
  const { lastFrame } = render(
    <LogPane entries={[{ event, id: 1 }]} epoch={0} />
  );
  return lastFrame() ?? "";
}

describe("a reply's acknowledgment code in the dev view", () => {
  it("shows an application accept `AA` in green", async () => {
    const row = await devRow("MSH|^~\\&|||||||ACK|ACK1|P|2.5.1\rMSA|AA|MSG001");

    expect(row).toContain(`${GREEN}AA`);
  });

  it("shows an application error `AE` in red", async () => {
    const row = await devRow("MSH|^~\\&|||||||ACK|ACK1|P|2.5.1\rMSA|AE|MSG001");

    expect(row).toContain(`${RED}AE`);
  });

  it("shows an application reject `AR` in red", async () => {
    const row = await devRow("MSH|^~\\&|||||||ACK|ACK1|P|2.5.1\rMSA|AR|MSG001");

    expect(row).toContain(`${RED}AR`);
  });

  it("shows a commit accept `CA` in green", async () => {
    const row = await devRow("MSH|^~\\&|||||||ACK|ACK1|P|2.5.1\rMSA|CA|MSG001");

    expect(row).toContain(`${GREEN}CA`);
  });

  it("shows a commit error `CE` in red", async () => {
    const row = await devRow("MSH|^~\\&|||||||ACK|ACK1|P|2.5.1\rMSA|CE|MSG001");

    expect(row).toContain(`${RED}CE`);
  });

  it("shows a commit reject `CR` in red", async () => {
    const row = await devRow("MSH|^~\\&|||||||ACK|ACK1|P|2.5.1\rMSA|CR|MSG001");

    expect(row).toContain(`${RED}CR`);
  });
});

describe("a reply whose field separator is not `|`", () => {
  it("is read with the field separator its MSH-1 declares", async () => {
    const event = await msgEvent(
      "MSH#|~\\&#######ACK#ACK1#P#2.5.1\rMSA#CA#MSG001"
    );

    expect(event).toMatchObject({ ack: "CA" });
  });
});
