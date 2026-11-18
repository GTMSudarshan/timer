import { describe, expect, it } from "vitest";
import { storage } from "./storage.js";

describe("storage", () => {
  it("prefixes keys and strips them from list results", async () => {
    await storage.set("settings", "hello");
    expect(localStorage.getItem("pomodoro_settings")).toBe("hello");

    const listed = await storage.list("set");
    expect(listed.keys).toContain("settings");
    expect(listed.keys[0].startsWith("pomodoro_")).toBe(false);
  });

  it("returns null for missing values", async () => {
    expect(await storage.get("missing-key")).toBeNull();
  });

  it("removes values", async () => {
    await storage.set("temp", "x");
    await storage.remove("temp");
    expect(await storage.get("temp")).toBeNull();
  });
});
