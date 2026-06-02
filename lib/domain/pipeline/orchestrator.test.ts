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

  it("stores mpeg recordings with an mp3 extension", async () => {
    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1]),
          mimeType: "audio/mpeg",
          providerId: "openai",
          transcript: "already transcribed",
        },
        deps(),
      ),
    );

    const final = events.find((e) => e.type === "report") as Extract<
      PipelineEvent,
      { type: "report" }
    >;
    expect(final.report.audioRef).toMatch(/\.mp3$/);
  });

  it("persists normalized audio duration seconds on the final report", async () => {
    const repo = new MemoryReportRepository();
    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1]),
          mimeType: "audio/webm",
          providerId: "openai",
          transcript: "already transcribed",
          audioSeconds: 94.6,
        },
        deps(repo),
      ),
    );

    const final = events.find((e) => e.type === "report") as Extract<
      PipelineEvent,
      { type: "report" }
    >;
    expect(final.report.audioSeconds).toBe(95);

    const persisted = await repo.get(final.report.id);
    expect(persisted?.audioSeconds).toBe(95);
  });

  it("reuses a live session report and preserves server-recorded chunk costs", async () => {
    const repo = new MemoryReportRepository();
    const session = await repo.create({
      providerId: "sarvam",
      audioRef: "pending:live",
    });
    await repo.update(session.id, {
      apiCost: {
        totals: [{ currency: "INR", amount: 0.241667 }],
        accuracy: "estimated",
        lineItems: [
          {
            stage: "transcription",
            provider: "sarvam",
            model: "saaras:v3",
            label: "Live transcript chunk",
            accuracy: "estimated",
            units: { audioSeconds: 29 },
            cost: { currency: "INR", amount: 0.241667 },
          },
        ],
        computedAt: "2026-05-25T08:59:30.000Z",
      },
    });

    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1, 2, 3]),
          mimeType: "audio/webm",
          providerId: "sarvam",
          transcript: "live transcript",
          reportId: session.id,
        },
        {
          ...deps(repo),
          generator: new FakeReportGenerator(undefined, [
            {
              stage: "report_generation",
              provider: "openai",
              model: "gpt-5.4",
              label: "Report generation",
              accuracy: "exact",
              units: { inputTokens: 1000, outputTokens: 100 },
              cost: { currency: "USD", amount: 0.004 },
            },
          ]),
        },
      ),
    );

    const final = events.find((e) => e.type === "report") as Extract<
      PipelineEvent,
      { type: "report" }
    >;
    expect(final.report.id).toBe(session.id);
    expect(final.report.audioRef).not.toBe("pending:live");
    expect(final.report.apiCost?.totals).toEqual([
      { currency: "INR", amount: 0.241667 },
      { currency: "USD", amount: 0.004 },
    ]);
    expect(final.report.apiCost?.accuracy).toBe("mixed");
    expect(final.report.apiCost?.lineItems).toHaveLength(2);
  });
});
