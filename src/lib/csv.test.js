import { describe, expect, it } from "vitest";
import { buildCSV, sanitizeCSVField } from "./csv.js";

describe("sanitizeCSVField", () => {
  it("escapes quotes", () => {
    expect(sanitizeCSVField('say "hi"')).toBe('say ""hi""');
  });

  it.each(["=1+1", "+cmd", "-cmd", "@cmd", "\tcmd"])(
    "neutralises formula injection in %j",
    (value) => {
      expect(sanitizeCSVField(value).startsWith("'")).toBe(true);
    },
  );
});

describe("buildCSV", () => {
  it("includes a header and sanitized rows", () => {
    const csv = buildCSV([
      { subject: "=Math", duration: 25, completedAt: "2026-03-09", type: "work" },
    ]);
    expect(csv.split("\n")[0]).toContain("Subject,Duration");
    expect(csv).toContain("'=Math");
    expect(csv).toContain("25");
  });
});
