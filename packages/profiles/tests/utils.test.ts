import { memoize } from "../src/utils";

describe("memoize", () => {
  it("calls fn once per argument object", () => {
    const fn = vi.fn((arg: { value: string }) => arg.value.toUpperCase());
    const upper = memoize(fn);
    const arg = { value: "pid" };

    expect([upper(arg), upper(arg)]).toEqual(["PID", "PID"]);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("returns the same result for the same argument object", () => {
    const wrap = memoize((arg: { value: string }) => ({ arg }));
    const arg = { value: "pid" };

    expect(wrap(arg)).toBe(wrap(arg));
  });

  it("calls fn again for an equal but distinct object", () => {
    const fn = vi.fn((arg: { value: string }) => arg.value);
    const read = memoize(fn);

    read({ value: "pid" });
    read({ value: "pid" });

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
