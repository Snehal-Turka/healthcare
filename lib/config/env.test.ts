import { describe, it, expect } from "vitest";
import { loadEnv } from "@/lib/config/env";

describe("loadEnv", () => {
  it("defaults DEFAULT_PROVIDER to openai and STORAGE_DIR to .data/audio", () => {
    const env = loadEnv({ DATABASE_URL: "file:./dev.db" });
    expect(env.DEFAULT_PROVIDER).toBe("openai");
    expect(env.STORAGE_DIR).toBe(".data/audio");
  });

  it("rejects an invalid DEFAULT_PROVIDER", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "file:./dev.db", DEFAULT_PROVIDER: "nope" }),
    ).toThrow();
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow();
  });
});
