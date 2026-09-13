/**
 * The queue of turns: who may start, who waits, and what a waiter is told
 * when it will never get a turn.
 */

import { setTimeout } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { createQueue } from "../src/queue";

/** Whether `wait` has settled, once every pending reaction has run. */
async function settled(wait: Promise<unknown>): Promise<boolean> {
  let done = false;
  const mark = () => {
    done = true;
  };
  void wait.then(mark, mark);
  await setTimeout(0);
  return done;
}

describe("createQueue", () => {
  it("lets the first to enter start at once, and makes the next wait", () => {
    const queue = createQueue();

    const head = queue.enter();
    const next = queue.enter();

    expect(head.wait).toBeNull();
    expect(next.wait).not.toBeNull();
  });

  it("starts the next when the head leaves, in enter order", async () => {
    const queue = createQueue();
    const head = queue.enter();
    const second = queue.enter();
    const third = queue.enter();

    queue.leave(head);

    expect(await settled(second.wait as Promise<unknown>)).toBe(true);
    expect(await settled(third.wait as Promise<unknown>)).toBe(false);

    queue.leave(second);
    expect(await settled(third.wait as Promise<unknown>)).toBe(true);
  });

  it("lets a waiter leave from the middle without starting anyone", async () => {
    const queue = createQueue();
    const head = queue.enter();
    const second = queue.enter();
    const third = queue.enter();

    queue.leave(second);
    expect(await settled(third.wait as Promise<unknown>)).toBe(false);

    queue.leave(head);
    expect(await settled(third.wait as Promise<unknown>)).toBe(true);
  });

  it("rejects every waiter with the error, and leaves the head alone", async () => {
    const queue = createQueue();
    const error = new Error("closed");
    const head = queue.enter();
    const second = queue.enter();
    const third = queue.enter();

    queue.rejectWaiting(error);

    expect(head.wait).toBeNull();
    await expect(second.wait).rejects.toBe(error);
    await expect(third.wait).rejects.toBe(error);
  });

  it("starts a newcomer once the head and the rejected waiters have left", async () => {
    const queue = createQueue();
    const head = queue.enter();
    const rejected = queue.enter();
    queue.rejectWaiting(new Error("closed"));
    await expect(rejected.wait).rejects.toBeInstanceOf(Error);
    queue.leave(rejected);

    const newcomer = queue.enter();
    expect(await settled(newcomer.wait as Promise<unknown>)).toBe(false);

    queue.leave(head);
    expect(await settled(newcomer.wait as Promise<unknown>)).toBe(true);
  });

  it("lets a place be taken again once everyone has left", () => {
    const queue = createQueue();
    const head = queue.enter();
    queue.leave(head);

    expect(queue.enter().wait).toBeNull();
  });
});
