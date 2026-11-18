import { describe, expect, it } from "vitest";
import { localDateKey, sessionDateKey, shiftDateKey } from "./dates.js";

describe("localDateKey", () => {
  it("uses local calendar fields instead of UTC", () => {
    // 22:30 local on Nov 18 is already Nov 19 in UTC for positive offsets.
    const date = new Date(2026, 10, 18, 22, 30, 0);
    expect(localDateKey(date)).toBe(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-18`,
    );
  });

  it("returns null for invalid dates", () => {
    expect(localDateKey(new Date("invalid"))).toBeNull();
  });
});

describe("shiftDateKey", () => {
  it("moves across month boundaries", () => {
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("sessionDateKey", () => {
  it("accepts ISO strings and rejects missing values", () => {
    expect(sessionDateKey({ completedAt: "2026-03-09T15:21:49.000Z" })).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(sessionDateKey({})).toBeNull();
    expect(sessionDateKey(null)).toBeNull();
  });
});
