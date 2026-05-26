import { describe, expect, it } from "vitest";
import {
  mapWithConcurrency,
  stitchTranscripts,
} from "@/lib/domain/pipeline/chunking";

describe("stitchTranscripts", () => {
  it("joins transcript parts with one space", () => {
    expect(stitchTranscripts(["a b", "c d"])).toBe("a b c d");
  });

  it("removes a small word overlap between adjacent parts", () => {
    expect(stitchTranscripts(["hello world", "world how are you"])).toBe(
      "hello world how are you",
    );
  });

  it("trims empty parts", () => {
    expect(stitchTranscripts([])).toBe("");
    expect(stitchTranscripts(["", "  ", "x"])).toBe("x");
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 2);

    expect(out).toEqual([2, 4, 6, 8]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    });

    expect(peak).toBeLessThanOrEqual(2);
  });
});
