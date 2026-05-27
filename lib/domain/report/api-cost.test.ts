import { describe, expect, it } from "vitest";
import {
  appendApiCostLineItem,
  formatApiCostTotal,
  priceAudioSeconds,
  priceTokenUsage,
  summarizeApiCost,
} from "./api-cost";
import type { ApiCost } from "./schema";

describe("api cost accounting", () => {
  it("prices token usage from per-million token rates", () => {
    const item = priceTokenUsage({
      stage: "report_generation",
      provider: "openai",
      model: "gpt-5.4",
      inputTokens: 1_200,
      outputTokens: 250,
      inputUsdPerMillion: 2.5,
      outputUsdPerMillion: 15,
      accuracy: "exact",
    });

    expect(item.cost).toEqual({ currency: "USD", amount: 0.00675 });
    expect(item.units).toMatchObject({
      inputTokens: 1200,
      outputTokens: 250,
      totalTokens: 1450,
    });
  });

  it("preserves mixed-currency totals when appending line items", () => {
    const now = () => "2026-05-27T10:00:00.000Z";
    const cost = appendApiCostLineItem(
      appendApiCostLineItem(null, {
        stage: "transcription",
        provider: "sarvam",
        model: "saaras:v3",
        label: "Live transcript chunk",
        accuracy: "estimated",
        units: { audioSeconds: 29 },
        cost: { currency: "INR", amount: 0.241667 },
      }, now),
      {
        stage: "report_generation",
        provider: "openai",
        model: "gpt-5.4",
        label: "Report generation",
        accuracy: "exact",
        units: { inputTokens: 1000, outputTokens: 100 },
        cost: { currency: "USD", amount: 0.004 },
      },
      now,
    );

    expect(cost.totals).toEqual([
      { currency: "INR", amount: 0.241667 },
      { currency: "USD", amount: 0.004 },
    ]);
    expect(cost.accuracy).toBe("mixed");
    expect(formatApiCostTotal(cost)).toBe("$0.0040 + ₹0.24 mixed");
  });

  it("summarizes stage totals for the report UI", () => {
    const cost: ApiCost = {
      totals: [],
      accuracy: "mixed",
      lineItems: [
        {
          stage: "transcription",
          provider: "openai",
          model: "gpt-4o-transcribe",
          label: "Transcript",
          accuracy: "exact",
          units: { audioSeconds: 29 },
          cost: { currency: "USD", amount: 0.0029 },
        },
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
      computedAt: "2026-05-27T10:00:00.000Z",
    };

    const summary = summarizeApiCost(cost);

    expect(summary).toEqual([
      { stage: "transcription", formatted: "$0.0029" },
      { stage: "report_generation", formatted: "$0.0040" },
    ]);
  });

  it("prices per-minute audio providers by rounded-up seconds", () => {
    const item = priceAudioSeconds({
      stage: "transcription",
      provider: "amazon",
      model: "aws-transcribe-standard",
      label: "Uploaded transcript",
      audioSeconds: 29.1,
      currency: "USD",
      pricePerHour: 1.44,
      accuracy: "estimated",
    });

    expect(item.units.audioSeconds).toBe(30);
    expect(item.cost).toEqual({ currency: "USD", amount: 0.012 });
  });
});
