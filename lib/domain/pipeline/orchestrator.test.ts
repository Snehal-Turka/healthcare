import { describe, it, expect } from "vitest";
import {
  runReportPipeline,
  type PipelineEvent,
} from "@/lib/domain/pipeline/orchestrator";
import { MemoryReportRepository } from "@/lib/adapters/repository/memory-report-repository";
import { MemoryStorage } from "@/lib/adapters/storage/memory-storage";
import { FakeTranscriptionProvider } from "@/lib/adapters/transcription/fake";
import { FakeReportGenerator } from "@/lib/adapters/generation/fake";

function deps(repo = new MemoryReportRepository()) {
  return {
    repo,
    storage: new MemoryStorage(),
    getProvider: () =>
      new FakeTranscriptionProvider("openai", {
        text: "kuch low feel ho raha hai",
        detectedLanguage: "hi",
      }),
    generator: new FakeReportGenerator(),
    now: () => new Date("2026-05-25T09:00:00.000Z"),
  };
}

async function collect(gen: AsyncGenerator<PipelineEvent>) {
  const events: PipelineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("runReportPipeline", () => {
  it("emits status, transcript, and a final ready report with computed deadlines", async () => {
    const repo = new MemoryReportRepository();
    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1, 2, 3]),
          mimeType: "audio/webm",
          providerId: "openai",
        },
        deps(repo),
      ),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("transcript");

    // sections stream in before the final report event
    const sections = events.filter((e) => e.type === "section");
    expect(sections).toHaveLength(4);
    const lastSectionIndex = types.lastIndexOf("section");
    const reportIndex = types.indexOf("report");
    expect(lastSectionIndex).toBeGreaterThanOrEqual(0);
    expect(lastSectionIndex).toBeLessThan(reportIndex);

    const final = events.find((e) => e.type === "report") as Extract<
      PipelineEvent,
      { type: "report" }
    >;
    expect(final.report.status).toBe("ready");
    expect(final.report.transcript).toContain("low feel");
    expect(final.report.content?.medications[0].medicine).toBe("Sertraline");
    expect(final.report.freeVisitDeadline).toBe("2026-05-28T09:00:00.000Z");
    expect(final.report.medicineExpiryDate).toBe("2026-07-25T09:00:00.000Z");
    expect(final.report.stageTimings.transcribeMs).toBeGreaterThanOrEqual(0);

    // persisted
    const persisted = await repo.get(final.report.id);
    expect(persisted?.status).toBe("ready");
  });

  it("marks the report failed and emits an error event when transcription throws", async () => {
    const repo = new MemoryReportRepository();
    const d = {
      ...deps(repo),
      getProvider: () => ({
        id: "openai" as const,
        supportsStreaming: false,
        transcribeBatch: async () => {
          throw new Error("stt down");
        },
      }),
    };
    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1]),
          mimeType: "audio/webm",
          providerId: "openai",
        },
        d,
      ),
    );
    const err = events.find((e) => e.type === "error") as Extract<
      PipelineEvent,
      { type: "error" }
    >;
    expect(err.message).toContain("stt down");
    const persisted = err.reportId ? await repo.get(err.reportId) : null;
    expect(persisted?.status).toBe("failed");
  });

  it("skips transcription when a transcript is supplied", async () => {
    const repo = new MemoryReportRepository();
    const provider = new FakeTranscriptionProvider("openai");
    const d = { ...deps(repo), getProvider: () => provider };

    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1]),
          mimeType: "audio/webm",
          providerId: "openai",
          transcript: "already transcribed",
        },
        d,
      ),
    );

    const tx = events.find((e) => e.type === "transcript") as Extract<
      PipelineEvent,
      { type: "transcript" }
    >;
    expect(tx.text).toBe("already transcribed");
    expect(provider.calls.length).toBe(0);

    const final = events.find((e) => e.type === "report") as Extract<
      PipelineEvent,
      { type: "report" }
    >;
    expect(final.report.stageTimings.transcribeMs).toBe(0);
  });
});
