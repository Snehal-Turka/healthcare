import { describe, it, expect } from "vitest";
import { OpenAIReportGenerator } from "@/lib/adapters/generation/openai-generator";
import type { ReportSection } from "@/lib/domain/report/schema";

/** Split a string into small pieces so line-buffering across chunks is exercised. */
function pieces(text: string, size = 7): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** Stub a streaming chat client: each entry in `responses` is one call's full output. */
function stubClient(responses: string[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const text = responses[i++] ?? "";
          return (async function* () {
            for (const piece of pieces(text)) {
              yield { choices: [{ delta: { content: piece } }] };
            }
          })();
        },
      },
    },
  } as never;
}

async function drain(gen: AsyncGenerator<ReportSection>) {
  const out: ReportSection[] = [];
  for await (const s of gen) out.push(s);
  return out;
}

const validNdjson = [
  JSON.stringify({ section: "riskFlags", data: [] }),
  JSON.stringify({ section: "summary", data: ["ok"] }),
  JSON.stringify({ section: "medications", data: [] }),
  JSON.stringify({ section: "nextMeeting", data: null }),
].join("\n");

describe("OpenAIReportGenerator", () => {
  it("streams sections from valid NDJSON output", async () => {
    const gen = new OpenAIReportGenerator(stubClient([validNdjson]));
    const sections = await drain(gen.generateStream("some transcript"));
    expect(sections.map((s) => s.section)).toEqual([
      "riskFlags",
      "summary",
      "medications",
      "nextMeeting",
    ]);
    const summary = sections.find((s) => s.section === "summary");
    expect(summary?.data).toEqual(["ok"]);
  });

  it("repairs once when the first output yields no sections", async () => {
    const gen = new OpenAIReportGenerator(
      stubClient(["not ndjson at all", validNdjson]),
    );
    const sections = await drain(gen.generateStream("some transcript"));
    expect(sections).toHaveLength(4);
  });

  it("repairs once when the first output is missing a required section", async () => {
    const missingMedications = [
      JSON.stringify({ section: "riskFlags", data: [] }),
      JSON.stringify({ section: "summary", data: ["ok"] }),
      JSON.stringify({ section: "nextMeeting", data: null }),
    ].join("\n");
    const gen = new OpenAIReportGenerator(
      stubClient([missingMedications, validNdjson]),
    );

    const sections = await drain(gen.generateStream("some transcript"));

    expect(sections.map((s) => s.section)).toEqual([
      "riskFlags",
      "summary",
      "nextMeeting",
      "riskFlags",
      "summary",
      "medications",
      "nextMeeting",
    ]);
  });

  it("throws when no sections parse even after repair", async () => {
    const gen = new OpenAIReportGenerator(stubClient(["nope", "still nope"]));
    await expect(drain(gen.generateStream("t"))).rejects.toThrow();
  });
});
