import { afterEach, describe, expect, it, vi } from "vitest";

import { InvariantError } from "../src/invariant";
import { ALPHABET, encodeCrockford, randomChars, uid } from "../src/uid";

const T0 = Date.UTC(2100, 0, 1);

afterEach(() => {
  vi.useRealTimers();
});

describe("encodeCrockford", () => {
  it("encodes zero-padded, big-endian, in the Crockford alphabet", () => {
    expect(encodeCrockford(0, 4)).toBe("0000");
    expect(encodeCrockford(1000, 4)).toBe("00Z8"); // 31 * 32 + 8
    expect(encodeCrockford(32 ** 4 - 1, 4)).toBe("ZZZZ");
  });

  it("throws InvariantError on a value that does not fit, instead of truncating", () => {
    expect(() => encodeCrockford(32 ** 4, 4)).toThrow(InvariantError);
    expect(() => encodeCrockford(32 ** 4, 4)).toThrow(/does not fit 4/);
  });

  it("throws InvariantError on values that are not encodable at all", () => {
    expect(() => encodeCrockford(-1, 4)).toThrow(/not encodable/);
    expect(() => encodeCrockford(1.5, 4)).toThrow(/not encodable/);
    expect(() => encodeCrockford(Number.NaN, 4)).toThrow(/not encodable/);
  });
});

describe("randomChars", () => {
  it("draws from an alphabet whose size divides 256 (the no-bias precondition)", () => {
    // One random byte spans 256 values, so `byte % ALPHABET.length` is
    // exactly uniform only when 256 is a whole multiple of the alphabet
    // size. This is the arithmetic fact the chi-squared test below
    // measures empirically; changing the alphabet's length breaks it.
    expect(256 % ALPHABET.length).toBe(0);
    expect(ALPHABET.length).toBe(32);
  });

  it("draws every alphabet character uniformly (chi-squared)", () => {
    // Pinned copy: if the source alphabet ever changes, this test must be
    // revisited — uniformity depends on 256 % alphabet.length === 0.
    const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const EXPECTED_PER_SYMBOL = 3000;
    const draws = 32 * EXPECTED_PER_SYMBOL;

    const counts = new Map<string, number>();
    for (let i = 0; i < draws / 10; i++) {
      for (const ch of randomChars(10)) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }

    // Only alphabet characters, and every one of the 32 appears (the odds
    // of a symbol missing in 96k uniform draws are ~(31/32)^96000 ≈ 0).
    expect([...counts.keys()].toSorted().join("")).toBe(CROCKFORD);

    // Chi-squared goodness-of-fit against the uniform distribution:
    // sum((observed - expected)^2 / expected) over the 32 bins follows a
    // chi-squared distribution with 31 degrees of freedom when the draws
    // are uniform — mean 31, standard deviation ~7.9. The 110 threshold
    // sits beyond the 1-in-a-billion quantile, so a fair generator never
    // trips it, while real bias (e.g. a 31-symbol alphabet, where bytes
    // 0-7 would map ~12.5% more often) scores in the hundreds.
    const sigma = Math.sqrt(draws * (1 / 32) * (31 / 32));
    let chiSquared = 0;
    let worstZ = 0;
    for (const ch of CROCKFORD) {
      const observed = counts.get(ch) ?? 0;
      chiSquared += (observed - EXPECTED_PER_SYMBOL) ** 2 / EXPECTED_PER_SYMBOL;
      const z = (observed - EXPECTED_PER_SYMBOL) / sigma;
      if (Math.abs(z) > Math.abs(worstZ)) {
        worstZ = z;
      }
    }
    // The numbers that matter: the statistic vs its fair-generator
    // distribution (chi-squared, df 31: mean 31, sd ~7.9; 110 is past the
    // one-in-a-billion quantile), and the single worst symbol deviation
    // (a fair run stays within about +-3 sigma).
    process.stdout.write(
      `\nchi-squared = ${chiSquared.toFixed(1)} (df 31, mean 31, threshold 110) — worst symbol deviation ${worstZ >= 0 ? "+" : ""}${worstZ.toFixed(1)} sigma over ${draws} draws\n`
    );
    expect(chiSquared).toBeLessThan(110);
  });
});

describe("uid", () => {
  it("uses only Crockford base32 characters (no I, L, O, U; MSH-10-safe)", () => {
    for (let i = 0; i < 50; i++) {
      expect(uid()).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{20}$/);
    }
  });

  it("orders lexicographically across milliseconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const first = uid();
    vi.setSystemTime(T0 + 5);
    const second = uid();
    expect(second > first).toBe(true);
  });

  it("stays unique within one millisecond, sharing the time prefix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 10);
    const ids = Array.from({ length: 100 }, () => uid());
    expect(new Set(ids).size).toBe(100);
    const prefixes = new Set(ids.map((id) => id.slice(0, 10)));
    expect(prefixes.size).toBe(1);
  });

  it("degrades to a pure-random ID when size leaves no room for a timestamp", () => {
    const id = uid({ size: 10 });
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
  });

  it("generates a 20-character string by default", () => {
    const id = uid();
    expect(id).toHaveLength(20);
  });

  it("generates a custom-length string", () => {
    const id = uid({ size: 10 });
    expect(id).toHaveLength(10);
  });

  it("generates unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    // The chance of collision is astronomically low for 20 random characters (62^20 possibilities)
    expect(ids.size).toBe(100);
  });

  it("rejects a size that is not a positive integer", () => {
    for (const size of [0, -5, 3.7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => uid({ size })).toThrow(RangeError);
      expect(() => uid({ size })).toThrow(/positive integer/);
    }
  });
});
