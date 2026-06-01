import { describe, it, expect } from "vitest";
import { loadEnv } from "@/lib/config/env";

describe("loadEnv", () => {
  it("defaults DEFAULT_PROVIDER to openai and STORAGE_DIR to .data/audio", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://runtime.example/neondb" });
    expect(env.DEFAULT_PROVIDER).toBe("openai");
    expect(env.STORAGE_DIR).toBe(".data/audio");
  });

  it("rejects an invalid DEFAULT_PROVIDER", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "postgresql://runtime.example/neondb",
        DEFAULT_PROVIDER: "nope",
      }),
    ).toThrow();
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow();
  });

  it("requires DATABASE_URL to be a Postgres URL", () => {
    expect(() => loadEnv({ DATABASE_URL: "file:./dev.db" })).toThrow();
  });

  it("allows DIRECT_URL for Prisma migrations", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://runtime.example/neondb",
      DIRECT_URL: "postgres://direct.example/neondb",
    });
    expect(env.DIRECT_URL).toBe("postgres://direct.example/neondb");
  });

  it("requires DIRECT_URL to be a Postgres URL when present", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "postgresql://runtime.example/neondb",
        DIRECT_URL: "file:./dev.db",
      }),
    ).toThrow();
  });
});
