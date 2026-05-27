import { randomUUID } from "node:crypto";
import type {
  ApiCost,
  ProviderId,
  ReportContent,
  ReportSection,
  StageTimings,
} from "@/lib/domain/report/schema";
import { applySection } from "@/lib/adapters/generation/collect";
import { appendApiCostLineItem } from "@/lib/domain/report/api-cost";
import {
  computeFreeVisitDeadline,
  computeMedicineExpiry,
} from "@/lib/domain/report/rules";
import type {
  ReportRecord,
  ReportRepository,
} from "@/lib/adapters/repository/report-repository";
import type { Storage } from "@/lib/adapters/storage/storage";
import type { TranscriptionProvider } from "@/lib/adapters/transcription/provider";
import type { ReportGenerator } from "@/lib/adapters/generation/generator";
import { timed } from "./timing";

export type PipelineEvent =
  | {
      type: "status";
      stage: "ingesting" | "transcribing" | "generating" | "finalizing";
      reportId: string;
    }
  | {
      type: "transcript";
      reportId: string;
      text: string;
      detectedLanguage: string | null;
    }
  | { type: "section"; reportId: string; payload: ReportSection }
  | { type: "report"; report: ReportRecord }
  | { type: "error"; reportId: string | null; message: string };

export interface PipelineDeps {
  repo: ReportRepository;
  storage: Storage;
  getProvider: (id: ProviderId) => TranscriptionProvider;
  generator: ReportGenerator;
  now?: () => Date;
}

export interface PipelineInput {
  audio: Uint8Array;
  mimeType: string;
  providerId: ProviderId;
  /** Supplied by the live recording path after chunk transcription. */
  transcript?: string;
  /** Supplied by the live recording path so chunk costs attach to one report. */
  reportId?: string;
  audioSeconds?: number;
}

export async function* runReportPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): AsyncGenerator<PipelineEvent> {
  const now = deps.now ?? (() => new Date());
  const timings: StageTimings = {};
  let apiCost: ApiCost | null = null;
  let reportId: string | null = null;

  try {
    const ext = input.mimeType.includes("mp4")
      ? "mp4"
      : input.mimeType.includes("wav")
        ? "wav"
        : input.mimeType.includes("mpeg") || input.mimeType.includes("mp3")
          ? "mp3"
          : "webm";
    const ingest = await timed(async () => {
      const audioRef = await deps.storage.save(
        `${randomUUID()}.${ext}`,
        input.audio,
        input.mimeType,
      );
      if (!input.reportId)
        return deps.repo.create({ providerId: input.providerId, audioRef });

      const existing = await deps.repo.get(input.reportId);
      if (!existing) throw new Error(`Report not found: ${input.reportId}`);
      apiCost = existing.apiCost;
      return deps.repo.update(input.reportId, {
        providerId: input.providerId,
        audioRef,
      });
    });
    timings.ingestMs = ingest.ms;
    reportId = ingest.result.id;
    yield { type: "status", stage: "ingesting", reportId };

    yield { type: "status", stage: "transcribing", reportId };
    let text: string;
    let detectedLanguage: string | null;
    if (input.transcript !== undefined) {
      text = input.transcript;
      detectedLanguage = null;
      timings.transcribeMs = 0;
    } else {
      const provider = deps.getProvider(input.providerId);
      const tx = await timed(() =>
        provider.transcribeBatch(input.audio, input.mimeType, {
          audioSeconds: input.audioSeconds,
          label: "Transcript",
        }),
      );
      text = tx.result.text;
      detectedLanguage = tx.result.detectedLanguage ?? null;
      if (tx.result.costLineItem) {
        apiCost = appendApiCostLineItem(apiCost, tx.result.costLineItem, () =>
          now().toISOString(),
        );
      }
      timings.transcribeMs = tx.ms;
    }
    await deps.repo.update(reportId, {
      transcript: text,
      detectedLanguage,
      stageTimings: timings,
      apiCost,
    });
    yield {
      type: "transcript",
      reportId,
      text,
      detectedLanguage,
    };

    yield { type: "status", stage: "generating", reportId };
    const content: ReportContent = {
      riskFlags: [],
      summary: [],
      medications: [],
      nextMeeting: null,
    };
    const genStart = Date.now();
    for await (const section of deps.generator.generateStream(text)) {
      applySection(content, section);
      yield { type: "section", reportId, payload: section };
    }
    for (const item of deps.generator.getCostLineItems?.() ?? []) {
      apiCost = appendApiCostLineItem(apiCost, item, () => now().toISOString());
    }
    timings.generateMs = Date.now() - genStart;

    yield { type: "status", stage: "finalizing", reportId };
    const generatedAt = now();
    const finalized = await deps.repo.update(reportId, {
      status: "ready",
      content,
      stageTimings: timings,
      apiCost,
      generatedAt: generatedAt.toISOString(),
      freeVisitDeadline: computeFreeVisitDeadline(generatedAt).toISOString(),
      medicineExpiryDate: computeMedicineExpiry(generatedAt).toISOString(),
    });

    yield { type: "report", report: finalized };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (reportId)
      await deps.repo.update(reportId, {
        status: "failed",
        error: message,
        stageTimings: timings,
      });
    yield { type: "error", reportId, message };
  }
}
