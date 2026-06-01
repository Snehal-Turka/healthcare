import { describe, expect, it } from "vitest";
import {
  resolveDatabaseUrl,
  resolveMigrationDatabaseUrl,
} from "@/lib/db/database-url";

describe("resolveDatabaseUrl", () => {
  it("requires DATABASE_URL", () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: "development" })).toThrow(
      /DATABASE_URL is required/,
    );
  });

  it("requires a Postgres DATABASE_URL", () => {
    expect(() =>
      resolveDatabaseUrl({ DATABASE_URL: "file:./dev.db" }),
    ).toThrow(/must be a Postgres connection string/);
  });

  it("accepts Neon Postgres connection strings", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL:
          "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
      }),
    ).toBe(
      "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
    );
  });

  it("uses DIRECT_URL for Prisma CLI migrations", () => {
    expect(
      resolveMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://runtime.example/neondb",
        DIRECT_URL: "postgresql://direct.example/neondb",
      }),
    ).toBe("postgresql://direct.example/neondb");
  });

  it("falls back to DATABASE_URL for migrations if DIRECT_URL is absent", () => {
    expect(
      resolveMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://runtime.example/neondb",
      }),
    ).toBe("postgresql://runtime.example/neondb");
  });

  it("rejects non-Postgres DIRECT_URL values", () => {
    expect(() =>
      resolveMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://runtime.example/neondb",
        DIRECT_URL: "file:./dev.db",
      }),
    ).toThrow(/DIRECT_URL must be a Postgres connection string/);
  });
});
