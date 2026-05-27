import type {
  ApiCost,
  ApiCostAccuracy,
  ApiCostCurrency,
  ApiCostLineItem,
  ApiCostStage,
  ProviderId,
} from "./schema";

type Clock = () => string;

const CURRENCY_ORDER: ApiCostCurrency[] = ["INR", "USD"];

export const PRICING_SNAPSHOT = {
  openai: {
    "gpt-5.4": {
      inputUsdPerMillion: 2.5,
      cachedInputUsdPerMillion: 0.25,
      outputUsdPerMillion: 15,
    },
    "gpt-4o-transcribe": {
      inputUsdPerMillion: 2.5,
      outputUsdPerMillion: 10,
      estimatedUsdPerMinute: 0.006,
    },
  },
  sarvam: {
    "saaras:v3": {
      currency: "INR" as const,
      pricePerHour: 30,
    },
  },
  amazon: {
    "aws-transcribe-standard": {
      currency: "USD" as const,
      pricePerHour: 1.44,
    },
  },
};

export function appendApiCostLineItem(
  existing: ApiCost | null | undefined,
  item: ApiCostLineItem,
  now: Clock = () => new Date().toISOString(),
): ApiCost {
  const lineItems = [...(existing?.lineItems ?? []), item];
  return recomputeApiCost(lineItems, existing?.computedAt ?? now());
}

export function recomputeApiCost(
  lineItems: ApiCostLineItem[],
  computedAt: string = new Date().toISOString(),
): ApiCost {
  const totals = CURRENCY_ORDER.map((currency) => {
    const amount = roundCost(
      lineItems
        .filter((item) => item.cost.currency === currency)
        .reduce((sum, item) => sum + item.cost.amount, 0),
    );
    return amount > 0 ? { currency, amount } : null;
  }).filter((item): item is { currency: ApiCostCurrency; amount: number } =>
    Boolean(item),
  );

  return {
    totals,
    accuracy: deriveAccuracy(lineItems),
    lineItems,
    computedAt,
  };
}

export function priceTokenUsage(input: {
  stage: ApiCostStage;
  provider: ProviderId | "openai";
  model: string;
  label?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
  accuracy: Exclude<ApiCostAccuracy, "mixed">;
}): ApiCostLineItem {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  const inputCost =
    (uncachedInputTokens / 1_000_000) * input.inputUsdPerMillion +
    (cachedInputTokens / 1_000_000) *
      (input.cachedInputUsdPerMillion ?? input.inputUsdPerMillion);
  const outputCost = (outputTokens / 1_000_000) * input.outputUsdPerMillion;

  return {
    stage: input.stage,
    provider: input.provider,
    model: input.model,
    label: input.label ?? labelForStage(input.stage),
    accuracy: input.accuracy,
    units: {
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedInputTokens || undefined,
      totalTokens: inputTokens + outputTokens,
      requests: 1,
    },
    cost: {
      currency: "USD",
      amount: roundCost(inputCost + outputCost),
    },
  };
}

export function priceAudioSeconds(input: {
  stage: ApiCostStage;
  provider: ProviderId;
  model: string;
  label: string;
  audioSeconds: number;
  currency: ApiCostCurrency;
  pricePerHour: number;
  accuracy: Exclude<ApiCostAccuracy, "mixed">;
}): ApiCostLineItem {
  const audioSeconds = Math.ceil(Math.max(input.audioSeconds, 0));
  return {
    stage: input.stage,
    provider: input.provider,
    model: input.model,
    label: input.label,
    accuracy: input.accuracy,
    units: {
      audioSeconds,
      requests: 1,
    },
    cost: {
      currency: input.currency,
      amount: roundCost((audioSeconds / 3600) * input.pricePerHour),
    },
  };
}

export function formatApiCostTotal(cost: ApiCost | null | undefined): string {
  if (!cost || cost.lineItems.length === 0) return "Not recorded";
  const total = [...cost.totals]
    .sort((a, b) => (a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : 0))
    .map((item) => formatMoney(item.currency, item.amount))
    .join(" + ");
  return `${total} ${cost.accuracy}`;
}

export function summarizeApiCost(cost: ApiCost): {
  stage: ApiCostStage;
  formatted: string;
}[] {
  const stages: ApiCostStage[] = ["transcription", "report_generation"];
  return stages.flatMap((stage) => {
    const byCurrency = CURRENCY_ORDER.map((currency) => {
      const amount = roundCost(
        cost.lineItems
          .filter(
            (item) => item.stage === stage && item.cost.currency === currency,
          )
          .reduce((sum, item) => sum + item.cost.amount, 0),
      );
      return amount > 0 ? formatMoney(currency, amount) : null;
    }).filter(Boolean);
    return byCurrency.length
      ? [{ stage, formatted: byCurrency.join(" + ") }]
      : [];
  });
}

export function formatMoney(currency: ApiCostCurrency, amount: number): string {
  if (currency === "INR") return `₹${amount.toFixed(2)}`;
  return `$${amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`;
}

function deriveAccuracy(lineItems: ApiCostLineItem[]): ApiCostAccuracy {
  const values = new Set(lineItems.map((item) => item.accuracy));
  if (values.size === 0) return "estimated";
  if (values.size > 1) return "mixed";
  return values.has("exact") ? "exact" : "estimated";
}

function labelForStage(stage: ApiCostStage): string {
  return stage === "transcription" ? "Transcript" : "Report generation";
}

function roundCost(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 1_000_000) / 1_000_000;
}
