import { describe, expect, it } from "vitest";
import { isValidYouTubeUrl, parseYouTubeUrl } from "./youtube.js";

describe("parseYouTubeUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=jfKfPfyJRdk", "jfKfPfyJRdk"],
    ["https://youtu.be/jfKfPfyJRdk?t=30", "jfKfPfyJRdk"],
    ["https://www.youtube.com/shorts/jfKfPfyJRdk", "jfKfPfyJRdk"],
    ["https://www.youtube.com/embed/jfKfPfyJRdk", "jfKfPfyJRdk"],
    ["jfKfPfyJRdk", "jfKfPfyJRdk"],
  ])("parses %s", (input, videoId) => {
    expect(parseYouTubeUrl(input)?.videoId).toBe(videoId);
  });

  it("keeps playlist IDs when no video is present", () => {
    expect(
      parseYouTubeUrl("https://www.youtube.com/playlist?list=PL123456789"),
    ).toEqual({ videoId: null, listId: "PL123456789" });
  });

  it("rejects invalid input", () => {
    expect(parseYouTubeUrl("https://example.com/watch?v=jfKfPfyJRdk")).toBeNull();
    expect(parseYouTubeUrl("https://youtube.com/watch?v=short")).toBeNull();
    expect(isValidYouTubeUrl("")).toBe(false);
  });
});
