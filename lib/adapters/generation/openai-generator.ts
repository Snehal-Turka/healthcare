import OpenAI from "openai";
import { env } from "@/lib/config/env";
import {
  parseSectionLine,
  type ReportSection,
} from "@/lib/domain/report/schema";
import type { ReportGenerator } from "./generator";
import { REPORT_SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

type ChatClient = Pick<OpenAI, "chat">;
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class OpenAIReportGenerator implements ReportGenerator {
  readonly id = "openai";
  private readonly client: ChatClient;

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
    const messages: ChatMessage[] = [
      { role: "system", content: REPORT_SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(transcript) },
    ];

    const sink = { raw: "" };
    let emitted = 0;
    for await (const section of this.streamSections(messages, sink)) {
      emitted++;
      yield section;
    }
    if (emitted > 0) return;

    // Nothing parsed — one repair attempt that echoes the bad output back.
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: sink.raw },
      {
        role: "user",
        content:
          "That was not valid. Reply with ONLY the four JSON lines (one JSON object per line) exactly as specified.",
      },
    ];
    for await (const section of this.streamSections(repair)) {
      emitted++;
      yield section;
    }
    if (emitted === 0)
      throw new Error(
        "OpenAIReportGenerator: could not obtain any report sections",
      );
  }

  private async *streamSections(
    messages: ChatMessage[],
    sink?: { raw: string },
  ): AsyncGenerator<ReportSection> {
    const stream = await this.client.chat.completions.create({
      model: "gpt-5.4",
      stream: true,
      messages,
    });

    let buffer = "";
    for await (const chunk of stream) {
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
