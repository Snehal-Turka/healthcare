import OpenAI from "openai";
import { env } from "@/lib/config/env";
import {
  parseSectionLine,
  type ApiCostLineItem,
  type ReportSection,
} from "@/lib/domain/report/schema";
import {
  PRICING_SNAPSHOT,
  priceTokenUsage,
} from "@/lib/domain/report/api-cost";
import type { ReportGenerator } from "./generator";
import { REPORT_SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

type ChatClient = Pick<OpenAI, "chat">;
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
const MODEL = "gpt-5.4";
const REQUIRED_SECTIONS = [
  "riskFlags",
  "summary",
  "medications",
  "nextMeeting",
] as const satisfies ReportSection["section"][];

export class OpenAIReportGenerator implements ReportGenerator {
  readonly id = "openai";
  private readonly client: ChatClient;
  private costLineItems: ApiCostLineItem[] = [];

  constructor(client?: ChatClient, apiKey?: string) {
    if (client) {
      this.client = client;
    } else {
      const key = apiKey ?? env().OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY is not set");
      this.client = new OpenAI({ apiKey: key });
    }
  }

  async *generateStream(transcript: string): AsyncGenerator<ReportSection> {
    this.costLineItems = [];
    const messages: ChatMessage[] = [
      { role: "system", content: REPORT_SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(transcript) },
    ];

    const sink = { raw: "" };
    const received = new Set<ReportSection["section"]>();
    for await (const section of this.streamSections(messages, sink)) {
      received.add(section.section);
      yield section;
    }
    if (hasAllRequiredSections(received)) return;

    // Missing or malformed sections are unsafe to silently finalize. Give the
    // model one repair attempt with its prior output as context.
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: sink.raw },
      {
        role: "user",
        content:
          `That was not valid. Missing required sections: ${missingSections(received).join(", ")}. Reply with ONLY the four JSON lines (one JSON object per line) exactly as specified.`,
      },
    ];
    const repaired = new Set(received);
    for await (const section of this.streamSections(repair)) {
      repaired.add(section.section);
      yield section;
    }
    if (!hasAllRequiredSections(repaired))
      throw new Error(
        `OpenAIReportGenerator: missing required report sections: ${missingSections(repaired).join(", ")}`,
      );
  }

  getCostLineItems(): ApiCostLineItem[] {
    return this.costLineItems;
  }

  private async *streamSections(
    messages: ChatMessage[],
    sink?: { raw: string },
  ): AsyncGenerator<ReportSection> {
    const stream = await this.client.chat.completions.create({
      model: MODEL,
      stream: true,
      stream_options: { include_usage: true },
      messages,
    });

    let buffer = "";
    for await (const chunk of stream) {
      const usage = chunk.usage;
      if (usage) this.costLineItems.push(costFromUsage(usage));
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      if (sink) sink.raw += delta;
      buffer += delta;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const section = parseSectionLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (section) yield section;
      }
    }
    const tail = parseSectionLine(buffer);
    if (tail) yield tail;
  }
}

function missingSections(sections: Set<ReportSection["section"]>) {
  return REQUIRED_SECTIONS.filter((section) => !sections.has(section));
}

function hasAllRequiredSections(sections: Set<ReportSection["section"]>) {
  return missingSections(sections).length === 0;
}

function costFromUsage(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}): ApiCostLineItem {
  const pricing = PRICING_SNAPSHOT.openai[MODEL];
  return priceTokenUsage({
    stage: "report_generation",
    provider: "openai",
    model: MODEL,
    label: "Report generation",
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens,
    inputUsdPerMillion: pricing.inputUsdPerMillion,
    cachedInputUsdPerMillion: pricing.cachedInputUsdPerMillion,
    outputUsdPerMillion: pricing.outputUsdPerMillion,
    accuracy: "exact",
  });
}
