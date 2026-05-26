import { describe, it, expect } from "vitest";
import { timed } from "@/lib/domain/pipeline/timing";

describe("timed", () => {
  it("returns the result and a non-negative duration", async () => {
    const { result, ms } = await timed(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(result).toBe(42);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
