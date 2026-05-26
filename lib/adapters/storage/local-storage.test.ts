import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { LocalStorage } from "@/lib/adapters/storage/local-storage";

const dir = ".data/test-audio";
const storage = new LocalStorage(dir);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("round-trips bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const ref = await storage.save(
      "clip.bin",
      bytes,
      "application/octet-stream",
    );
    const loaded = await storage.load(ref);
    expect(Array.from(loaded)).toEqual([1, 2, 3, 4]);
  });
});
