"use client";

import type { ReportRecord } from "@/lib/adapters/repository/report-repository";
import type {
  ApiCost,
  ApiCostCurrency,
  StageTimings,
} from "@/lib/domain/report/schema";

type TimeTakenLog = {
  reportId: string;
  totalMs: number;
  total: string;
  stages: {
    ingest: string;
    transcribe: string;
    generate: string;
  };
};

type CostLog = {
  reportId: string;
  total: string;
  accuracy: ApiCost["accuracy"] | "not_recorded";
  usdToInrRate?: number;
  allCostsInInrEstimate?: string;
  totals: {
    currency: string;
    amount: number;
    formatted: string;
    inrEstimate?: string;
  }[];
  lineItems: {
    stage: string;
    provider: string;
    model: string;
    label: string;
    cost: string;
    inrEstimate?: string;
    accuracy: string;
  }[];
};

const USD_TO_INR_RATE = 83; // Replace with an API-fetched rate when needed.

export function logReportDiagnostics(report: ReportRecord) {
  console.log(
    "[Report diagnostics] Time taken",
    buildTimeTakenLog(report.id, report.stageTimings),
  );
  console.log(
    "[Report diagnostics] API cost",
    buildCostLog(report.id, report.apiCost, USD_TO_INR_RATE),
  );
}

export function buildTimeTakenLog(
  reportId: string,
  timings: StageTimings,
): TimeTakenLog {
  const ingestMs = timings.ingestMs ?? 0;
  const transcribeMs = timings.transcribeMs ?? 0;
  const generateMs = timings.generateMs ?? 0;
  const totalMs = ingestMs + transcribeMs + generateMs;

  return {
    reportId,
    totalMs,
    total: formatSeconds(totalMs),
    stages: {
      ingest: formatSeconds(ingestMs),
      transcribe: formatSeconds(transcribeMs),
      generate: formatSeconds(generateMs),
    },
  };
}

export function buildCostLog(
  reportId: string,
  cost: ApiCost | null,
  usdToInrRate?: number,
): CostLog {
  if (!cost || cost.lineItems.length === 0) {
    return {
      reportId,
      total: "Not recorded",
      accuracy: "not_recorded",
      totals: [],
      lineItems: [],
    };
  }

  const inrTotal =
    cost.totals.find((item) => item.currency === "INR")?.amount ?? 0;
  const usdTotal =
    cost.totals.find((item) => item.currency === "USD")?.amount ?? 0;
  const allCostsInInrEstimate =
    usdToInrRate && usdTotal > 0
      ? formatInr(inrTotal + usdTotal * usdToInrRate)
      : undefined;

  return {
    reportId,
    total: formatLogCostTotal(cost),
    accuracy: cost.accuracy,
    usdToInrRate,
    allCostsInInrEstimate,
    totals: cost.totals.map((item) => ({
      currency: item.currency,
      amount: item.amount,
      formatted: formatLogMoney(item.currency, item.amount),
      inrEstimate:
        item.currency === "USD" && usdToInrRate
          ? formatInr(item.amount * usdToInrRate)
          : undefined,
    })),
    lineItems: cost.lineItems.map((item) => ({
      stage: item.stage,
      provider: item.provider,
      model: item.model,
      label: item.label,
      cost: formatLogMoney(item.cost.currency, item.cost.amount),
      inrEstimate:
        item.cost.currency === "USD" && usdToInrRate
          ? formatInr(item.cost.amount * usdToInrRate)
          : undefined,
      accuracy: item.accuracy,
    })),
  };
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatLogCostTotal(cost: ApiCost): string {
  const total = [...cost.totals]
    .sort((a, b) => (a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : 0))
    .map((item) => formatLogMoney(item.currency, item.amount))
    .join(" + ");
  return `${total} ${cost.accuracy}`;
}

function formatLogMoney(currency: ApiCostCurrency, amount: number): string {
  if (currency === "INR") return formatInr(amount);
  return `$${amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`;
}

function formatInr(amount: number): string {
  return `INR ${amount.toFixed(2)}`;
}
