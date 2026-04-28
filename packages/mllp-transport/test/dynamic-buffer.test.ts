import { DynamicBuffer } from "../src/dynamic-buffer.js";

describe("DynamicBuffer", () => {
  it("starts empty with given initial capacity", () => {
    const buf = new DynamicBuffer(64);
    expect(buf.available).toBe(0);
    expect(buf.capacity).toBe(64);
  });

  it("appends data and exposes it via view()", () => {
    const buf = new DynamicBuffer(64);
    buf.append(new Uint8Array([1, 2, 3]));
    buf.append(new Uint8Array([4, 5]));
    expect(buf.available).toBe(5);
    const view = buf.view();
    expect(view).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("doubles capacity when append exceeds current capacity", () => {
    const buf = new DynamicBuffer(4);
    buf.append(new Uint8Array([1, 2, 3, 4]));
    expect(buf.capacity).toBe(4);
    buf.append(new Uint8Array([5]));
    expect(buf.capacity).toBe(8);
    expect(buf.view()).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("grows to fit chunks larger than double the current capacity", () => {
    const buf = new DynamicBuffer(4);
    const largeChunk = new Uint8Array(100);
    largeChunk.fill(42);
    buf.append(largeChunk);
    expect(buf.capacity).toBeGreaterThanOrEqual(100);
    expect(buf.available).toBe(100);
    expect(buf.view()[0]).toBe(42);
    expect(buf.view()[99]).toBe(42);
  });

  it("consume() advances the read offset", () => {
    const buf = new DynamicBuffer(64);
    buf.append(new Uint8Array([10, 20, 30, 40, 50]));
    buf.consume(2);
    expect(buf.available).toBe(3);
    expect(buf.view()).toEqual(new Uint8Array([30, 40, 50]));
  });

  it("auto-compacts when offset exceeds half capacity", () => {
    const buf = new DynamicBuffer(8);
    buf.append(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    buf.consume(5);
    expect(buf.available).toBe(3);
    expect(buf.view()).toEqual(new Uint8Array([6, 7, 8]));
  });

  it("reset() clears all state", () => {
    const buf = new DynamicBuffer(64);
    buf.append(new Uint8Array([1, 2, 3]));
    buf.consume(1);
    buf.reset();
    expect(buf.available).toBe(0);
    expect(buf.view()).toEqual(new Uint8Array([]));
  });

  it("handles multiple grow-compact cycles", () => {
    const buf = new DynamicBuffer(4);
    for (let i = 0; i < 100; i++) {
      buf.append(new Uint8Array([i % 256, (i + 1) % 256]));
      buf.consume(2);
    }
    expect(buf.available).toBe(0);
  });

  it("view() returns a zero-copy subarray", () => {
    const buf = new DynamicBuffer(64);
    buf.append(new Uint8Array([1, 2, 3]));
    const view1 = buf.view();
    const view2 = buf.view();
    expect(view1.buffer).toBe(view2.buffer);
  });
});
