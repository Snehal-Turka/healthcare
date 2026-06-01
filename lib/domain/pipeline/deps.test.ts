import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { productionStorage } from "./deps";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/adapters/transcription/registry", () => ({
  getTranscriptionProvider: vi.fn(),
}));
vi.mock("@/lib/adapters/generation/registry", () => ({
  getReportGenerator: vi.fn(),
}));

const baseEnv = {
  DATABASE_URL: "postgresql://runtime.example/neondb",
  DEFAULT_PROVIDER: "openai" as const,
  STORAGE_DIR: ".data/audio",
  RETAIN_AUDIO: false,
};

describe("productionStorage", () => {
  it("discards report audio by default instead of writing to STORAGE_DIR", async () => {
    const dir = await mkdtemp(join(tmpdir(), "healthcare-audio-"));
    try {
      const storage = productionStorage({ ...baseEnv, STORAGE_DIR: dir });

      const ref = await storage.save(
        "consult.webm",
        new Uint8Array([1, 2, 3]),
        "audio/webm",
      );

      expect(ref).toBe("discarded:consult.webm");
      await expect(storage.load(ref)).rejects.toThrow(/not retained/i);
      await expect(readdir(dir)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
