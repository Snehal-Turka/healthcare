import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  parseApiCost,
  PrismaReportRepository,
} from "@/lib/adapters/repository/prisma-report-repository";

const url = "file:./test-repo.db";
let prisma: PrismaClient;
let repo: PrismaReportRepository;

beforeAll(() => {
  execSync(`npx prisma db push --url "${url}"`, {
    env: { ...process.env, RUST_LOG: "debug" },
    stdio: "ignore",
  });
  const adapter = new PrismaBetterSqlite3({ url });
  prisma = new PrismaClient({ adapter });
  repo = new PrismaReportRepository(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await rm("./test-repo.db", { force: true });
  await rm("./test-repo.db-journal", { force: true });
});

describe("PrismaReportRepository", () => {
  it("treats missing legacy api cost values as not recorded", () => {
    expect(parseApiCost(undefined)).toBeNull();
    expect(parseApiCost(null)).toBeNull();
    expect(parseApiCost("undefined")).toBeNull();
    expect(parseApiCost("{}")).toBeNull();
  });

  it("creates, updates, gets, and lists", async () => {
    const created = await repo.create({
      providerId: "openai",
      audioRef: "local:.data/x.webm",
    });
    expect(created.status).toBe("processing");
    expect(created.content).toBeNull();

    const updated = await repo.update(created.id, {
      status: "ready",
      transcript: "hello",
      content: {
        riskFlags: [],
        summary: ["a"],
        medications: [],
        nextMeeting: null,
      },
      freeVisitDeadline: "2026-05-28T09:00:00.000Z",
      stageTimings: { transcribeMs: 120 },
      apiCost: {
        totals: [{ currency: "USD", amount: 0.004 }],
        accuracy: "exact",
        lineItems: [
          {
            stage: "report_generation",
            provider: "openai",
            model: "gpt-5.4",
            label: "Report generation",
            accuracy: "exact",
            units: { inputTokens: 1000, outputTokens: 100 },
            cost: { currency: "USD", amount: 0.004 },
          },
        ],
        computedAt: "2026-05-25T09:00:00.000Z",
      },
      generatedAt: "2026-05-25T09:00:00.000Z",
    });
    expect(updated.status).toBe("ready");
    expect(updated.content?.summary).toEqual(["a"]);
    expect(updated.stageTimings.transcribeMs).toBe(120);
    expect(updated.apiCost?.totals).toEqual([
      { currency: "USD", amount: 0.004 },
    ]);

    const fetched = await repo.get(created.id);
    expect(fetched?.transcript).toBe("hello");
    expect(fetched?.apiCost?.lineItems[0].model).toBe("gpt-5.4");

    const all = await repo.list();
    expect(all.length).toBe(1);
  });
});
