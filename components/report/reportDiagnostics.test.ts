import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCostLog,
  buildTimeTakenLog,
  logReportDiagnostics,
} from "./reportDiagnostics";
import type { ReportRecord } from "@/lib/adapters/repository/report-repository";
import type { ApiCost } from "@/lib/domain/report/schema";

describe("report diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats time taken for console logging", () => {
    expect(
      buildTimeTakenLog("report-1", {
        ingestMs: 120,
        transcribeMs: 3456,
        generateMs: 7890,
      }),
    ).toEqual({
      reportId: "report-1",
      totalMs: 11466,
      total: "11.47s",
      stages: {
        ingest: "0.12s",
        transcribe: "3.46s",
        generate: "7.89s",
      },
    });
  });

  it("adds INR estimates for USD cost logs when a rate is configured", () => {
    const cost: ApiCost = {
      totals: [
        { currency: "INR", amount: 1.25 },
        { currency: "USD", amount: 0.004 },
      ],
      accuracy: "mixed",
      computedAt: "2026-06-02T00:00:00.000Z",
      lineItems: [
        {
          stage: "transcription",
          provider: "sarvam",
          model: "saaras:v3",
          label: "Transcript",
          accuracy: "estimated",
          units: { audioSeconds: 30, requests: 1 },
          cost: { currency: "INR", amount: 1.25 },
        },
        {
          stage: "report_generation",
          provider: "openai",
          model: "gpt-5.4",
          label: "Report generation",
          accuracy: "exact",
          units: { totalTokens: 1000, requests: 1 },
          cost: { currency: "USD", amount: 0.004 },
        },
      ],
    };

    expect(buildCostLog("report-1", cost, 83)).toMatchObject({
      reportId: "report-1",
      total: "$0.0040 + INR 1.25 mixed",
      accuracy: "mixed",
      usdToInrRate: 83,
      allCostsInInrEstimate: "INR 1.58",
      totals: [
        { currency: "INR", formatted: "INR 1.25" },
        {
          currency: "USD",
          formatted: "$0.0040",
          inrEstimate: "INR 0.33",
        },
      ],
      lineItems: [
        { cost: "INR 1.25" },
        { cost: "$0.0040", inrEstimate: "INR 0.33" },
      ],
    });
  });

  it("logs API cost with the temporary USD to INR constant", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const report: ReportRecord = {
      id: "report-1",
      status: "ready",
      providerId: "openai",
      audioRef: "memory://audio",
      detectedLanguage: null,
      transcript: "Patient reports poor sleep.",
      audioSeconds: 95,
      content: {
        riskFlags: [],
        summary: [],
        medications: [],
        nextMeeting: null,
      },
      freeVisitDeadline: null,
      medicineExpiryDate: null,
      stageTimings: {
        ingestMs: 100,
        transcribeMs: 200,
        generateMs: 300,
      },
      apiCost: {
        totals: [{ currency: "USD", amount: 0.004 }],
        accuracy: "exact",
        computedAt: "2026-06-02T00:00:00.000Z",
        lineItems: [
          {
            stage: "report_generation",
            provider: "openai",
            model: "gpt-5.4",
            label: "Report generation",
            accuracy: "exact",
            units: { totalTokens: 1000, requests: 1 },
            cost: { currency: "USD", amount: 0.004 },
          },
        ],
      },
      error: null,
      createdAt: "2026-06-02T00:00:00.000Z",
      generatedAt: "2026-06-02T00:00:01.000Z",
    };

    logReportDiagnostics(report);

    expect(log).toHaveBeenCalledWith(
      "[Report diagnostics] API cost",
      expect.objectContaining({
        usdToInrRate: 83,
        allCostsInInrEstimate: "INR 0.33",
        totals: [
          expect.objectContaining({
            currency: "USD",
            inrEstimate: "INR 0.33",
          }),
        ],
      }),
    );
  });
});
