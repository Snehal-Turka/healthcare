# Phase 2 — Adapters: Transcription Providers & Report Generator — ✅ COMPLETE

> **Status:** Done (2026-05-25). 2 new test suites (5 tests) green, all 7 suites (17 tests) passing. Transcription registry + 3 live providers + OpenAI report generator with validate/repair.

**Goal:** Build the swappable transcription providers (OpenAI wired live; Sarvam + Amazon implemented behind the same interface) and the OpenAI report generator that turns any-language transcripts into a structured **English** `ReportContent` — all behind interfaces with deterministic fakes for tests.

**Architecture:** Every external service sits behind a small interface in `lib/adapters`. A registry maps `ProviderId` → `TranscriptionProvider`, defaulting to `env.DEFAULT_PROVIDER`. The report generator validates model output against `ReportContentSchema` (from Phase 1) and repairs once on failure. Tests use fakes only; live calls are checked via a documented manual smoke step.

**Tech Stack:** OpenAI SDK, AWS SDK (Transcribe + S3), `fetch` (Sarvam), Zod, Vitest. Depends on Phase 1.

---

## File structure introduced in this phase

```
lib/adapters/transcription/provider.ts        # TranscriptionProvider interface + result types
lib/adapters/transcription/fake.ts            # FakeTranscriptionProvider
lib/adapters/transcription/openai.ts          # live
lib/adapters/transcription/sarvam.ts          # live
lib/adapters/transcription/amazon.ts          # live (batch via S3 + poll)
lib/adapters/transcription/registry.ts        # getTranscriptionProvider(id)
lib/adapters/generation/generator.ts          # ReportGenerator interface
lib/adapters/generation/prompt.ts             # system prompt + builder
lib/adapters/generation/fake.ts               # FakeReportGenerator
lib/adapters/generation/openai-generator.ts   # live (JSON mode + zod validate + repair)
```

---

### Task 1: Install provider SDKs

**Files:** Modify `package.json`

- [ ] **Step 1: Install**

```bash
yarn add openai @aws-sdk/client-transcribe @aws-sdk/client-s3
```

---

### Task 2: Transcription interface + fake + registry

**Files:**

- Create: `lib/adapters/transcription/provider.ts`
- Create: `lib/adapters/transcription/fake.ts`
- Create: `lib/adapters/transcription/registry.ts`
- Test: `lib/adapters/transcription/registry.test.ts`

- [ ] **Step 1: Define the interface**

```ts
// lib/adapters/transcription/provider.ts
import type { ProviderId } from "@/lib/domain/report/schema";

export interface TranscriptionResult {
  text: string;
  detectedLanguage?: string;
}

export interface TranscriptionProvider {
  readonly id: ProviderId;
  readonly supportsStreaming: boolean;
  /** Transcribe a complete audio buffer (or a single chunk). Output is in the spoken language. */
  transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult>;
  /** Optional realtime path (wired in Phase 5). */
  transcribeStream?(
    chunks: AsyncIterable<Uint8Array>,
    mimeType: string,
  ): AsyncIterable<{ partial: string; isFinal: boolean }>;
}
```

- [ ] **Step 2: Implement the fake**

```ts
// lib/adapters/transcription/fake.ts
import type { ProviderId } from "@/lib/domain/report/schema";
import type { TranscriptionProvider, TranscriptionResult } from "./provider";

export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly supportsStreaming = false;
  public calls: { bytes: number; mimeType: string }[] = [];

  constructor(
    readonly id: ProviderId = "openai",
    private readonly result: TranscriptionResult = {
      text: "Patient reports low mood and poor sleep for three weeks.",
      detectedLanguage: "hi",
    },
  ) {}

  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult> {
    this.calls.push({ bytes: audio.byteLength, mimeType });
    return this.result;
  }
}
```

- [ ] **Step 3: Write the failing registry test**

```ts
// lib/adapters/transcription/registry.test.ts
import { describe, it, expect } from "vitest";
import { createRegistry } from "@/lib/adapters/transcription/registry";
import { FakeTranscriptionProvider } from "@/lib/adapters/transcription/fake";

describe("transcription registry", () => {
  it("returns the provider for a given id", () => {
    const reg = createRegistry({
      openai: () => new FakeTranscriptionProvider("openai"),
      sarvam: () => new FakeTranscriptionProvider("sarvam"),
      amazon: () => new FakeTranscriptionProvider("amazon"),
    });
    expect(reg.get("sarvam").id).toBe("sarvam");
  });

  it("throws for an unknown id", () => {
    const reg = createRegistry({
      openai: () => new FakeTranscriptionProvider("openai"),
    } as never);
    // @ts-expect-error intentionally invalid
    expect(() => reg.get("nope")).toThrow();
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `yarn vitest run lib/adapters/transcription/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the registry**

A factory map keeps construction lazy (so missing keys for unused providers don't crash). `getTranscriptionProvider` is the production entry point.

```ts
// lib/adapters/transcription/registry.ts
import type { ProviderId } from "@/lib/domain/report/schema";
import { env } from "@/lib/config/env";
import type { TranscriptionProvider } from "./provider";
import { OpenAITranscriptionProvider } from "./openai";
import { SarvamTranscriptionProvider } from "./sarvam";
import { AmazonTranscriptionProvider } from "./amazon";

export type ProviderFactories = Record<ProviderId, () => TranscriptionProvider>;

export function createRegistry(factories: ProviderFactories) {
  return {
    get(id: ProviderId): TranscriptionProvider {
      const make = factories[id];
      if (!make) throw new Error(`Unknown transcription provider: ${id}`);
      return make();
    },
  };
}

const defaultFactories: ProviderFactories = {
  openai: () => new OpenAITranscriptionProvider(),
  sarvam: () => new SarvamTranscriptionProvider(),
  amazon: () => new AmazonTranscriptionProvider(),
};

const registry = createRegistry(defaultFactories);

export function getTranscriptionProvider(
  id: ProviderId = env.DEFAULT_PROVIDER,
): TranscriptionProvider {
  return registry.get(id);
}
```

> Note: this file imports the three live providers built in Tasks 3–5. Implement them before running the app, but the registry **test** above only uses the fake, so it passes once those files exist as valid modules.

- [ ] **Step 6: Run the test to confirm it passes** (after Tasks 3–5 create the imported modules, or temporarily stub the imports)

Run: `yarn vitest run lib/adapters/transcription/registry.test.ts`
Expected: PASS (2 tests).

---

### Task 3: OpenAI transcription provider (live)

**Files:** Create `lib/adapters/transcription/openai.ts`

- [ ] **Step 1: Implement**

`toFile` adapts a Node buffer to the SDK's upload type. Transcription stays in the **spoken language**; translation to English happens in the generator (Task 7).

```ts
// lib/adapters/transcription/openai.ts
import OpenAI, { toFile } from "openai";
import { env } from "@/lib/config/env";
import type { TranscriptionProvider, TranscriptionResult } from "./provider";

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly id = "openai" as const;
  readonly supportsStreaming = true; // realtime wired in Phase 5
  private readonly client: OpenAI;

  constructor(apiKey = env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    this.client = new OpenAI({ apiKey });
  }

  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult> {
    const ext =
      mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : mimeType.includes("wav")
          ? "wav"
          : "webm";
    const file = await toFile(Buffer.from(audio), `audio.${ext}`, {
      type: mimeType,
    });
    const res = await this.client.audio.transcriptions.create({
      file,
      model: "gpt-4o-transcribe",
    });
    return { text: res.text };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in this file.

---

### Task 4: Sarvam transcription provider (live)

**Files:** Create `lib/adapters/transcription/sarvam.ts`

- [ ] **Step 1: Implement via the `sarvamai` SDK**

Sarvam ships an official TypeScript SDK (`sarvamai`). Construct `SarvamAIClient` with an `apiSubscriptionKey` and call `speechToText.transcribe`. Use the `saaras:v3` model in `transcribe` mode — the older `saarika:v2.5` raw-REST call is deprecated. Pass `language_code: "unknown"` to auto-detect across Indian languages; the response carries the transcript plus the detected `language_code`. Follow the repo's DI convention (optional injected client, like `OpenAIReportGenerator`) so the client can be stubbed in tests.

```ts
// lib/adapters/transcription/sarvam.ts
import { SarvamAIClient } from "sarvamai";
import { env } from "@/lib/config/env";
import type { TranscriptionProvider, TranscriptionResult } from "./provider";

type SpeechClient = Pick<SarvamAIClient, "speechToText">;

function fileNameFor(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "audio.m4a";
  if (mimeType.includes("wav")) return "audio.wav";
  if (mimeType.includes("ogg")) return "audio.ogg";
  return "audio.webm";
}

export class SarvamTranscriptionProvider implements TranscriptionProvider {
  readonly id = "sarvam" as const;
  readonly supportsStreaming = false;
  private readonly client: SpeechClient;

  constructor(client?: SpeechClient, apiKey?: string) {
    if (client) {
      this.client = client;
    } else {
      const key = apiKey ?? env().SARVAM_API_KEY;
      if (!key) throw new Error("SARVAM_API_KEY is not set");
      this.client = new SarvamAIClient({ apiSubscriptionKey: key });
    }
  }

  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult> {
    const res = await this.client.speechToText.transcribe({
      file: {
        data: Buffer.from(audio),
        filename: fileNameFor(mimeType),
        contentType: mimeType,
      },
      model: "saaras:v3",
      mode: "transcribe",
      language_code: "unknown", // auto-detect across Indian languages
    });
    return { text: res.transcript, detectedLanguage: res.language_code };
  }
}
```

> **Note:** `speechToText.transcribe` hits Sarvam's REST endpoint, intended for clips under ~30s. For longer audio the SDK exposes a batch job API (`client.speechToTextJob`). The chunked-upload pipeline keeps clips short, so the REST path is the right default here.

- [ ] **Step 2: Type-check and test**

Run: `npx tsc --noEmit` (expected: no errors) and `npx vitest run lib/adapters/transcription`. `sarvam.test.ts` stub-injects a fake `speechToText` client and asserts the `saaras:v3` / `transcribe` request shape plus the response mapping.

---

### Task 5: Amazon Transcribe provider (live, batch via S3)

**Files:** Create `lib/adapters/transcription/amazon.ts`

- [ ] **Step 1: Implement batch (upload to S3 → start job → poll → fetch result)**

`supportsStreaming` is `true` (the streaming path is wired in Phase 5); this batch path is used everywhere until then.

```ts
// lib/adapters/transcription/amazon.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { env } from "@/lib/config/env";
import type { TranscriptionProvider, TranscriptionResult } from "./provider";

export class AmazonTranscriptionProvider implements TranscriptionProvider {
  readonly id = "amazon" as const;
  readonly supportsStreaming = true;
  private readonly s3: S3Client;
  private readonly transcribe: TranscribeClient;

  constructor(
    private readonly region = env().AWS_REGION,
    private readonly bucket = env().AWS_S3_BUCKET,
    private readonly accessKeyId = env().AWS_ACCESS_KEY_ID,
    private readonly secretAccessKey = env().AWS_SECRET_ACCESS_KEY,
  ) {
    if (!region || !bucket || !accessKeyId || !secretAccessKey)
      throw new Error(
        "AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are required for Amazon Transcribe",
      );
    this.s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.transcribe = new TranscribeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async transcribeBatch(
    audio: Uint8Array,
    mimeType: string,
  ): Promise<TranscriptionResult> {
    const jobName = `scribe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext =
      mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "mp4"
        : mimeType.includes("wav")
          ? "wav"
          : "webm";
    const key = `uploads/${jobName}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: audio,
        ContentType: mimeType,
      }),
    );

    await this.transcribe.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        IdentifyLanguage: true,
        MediaFormat: ext === "mp4" ? "mp4" : (ext as "wav" | "webm"),
        Media: { MediaFileUri: `s3://${this.bucket}/${key}` },
      }),
    );

    const result = await this.poll(jobName);
    const uri = result.Transcript?.TranscriptFileUri;
    if (!uri) throw new Error("Amazon Transcribe returned no transcript URI");
    const data = (await (await fetch(uri)).json()) as {
      results: { transcripts: { transcript: string }[] };
    };
    return {
      text: data.results.transcripts[0]?.transcript ?? "",
      detectedLanguage: result.LanguageCode,
    };
  }

  private async poll(jobName: string, timeoutMs = 120_000) {
    const start = Date.now();
    for (;;) {
      const { TranscriptionJob } = await this.transcribe.send(
        new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
      );
      const status = TranscriptionJob?.TranscriptionJobStatus;
      if (status === "COMPLETED") return TranscriptionJob!;
      if (status === "FAILED")
        throw new Error(
          `Amazon Transcribe job failed: ${TranscriptionJob?.FailureReason}`,
        );
      if (Date.now() - start > timeoutMs)
        throw new Error("Amazon Transcribe job timed out");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 6: Report generator interface + prompt + fake

**Files:**

- Create: `lib/adapters/generation/generator.ts`
- Create: `lib/adapters/generation/prompt.ts`
- Create: `lib/adapters/generation/fake.ts`

- [ ] **Step 1: Define the interface**

```ts
// lib/adapters/generation/generator.ts
import type { ReportContent } from "@/lib/domain/report/schema";

export interface ReportGenerator {
  readonly id: string;
  /** Produces a structured English report from a (possibly non-English) transcript. */
  generate(transcript: string): Promise<ReportContent>;
}
```

- [ ] **Step 2: Write the prompt module**

A static, cache-friendly system prompt (the transcript is the only variable part). It pins English output, the JSON shape, and the "alert not diagnosis" framing for risk flags.

```ts
// lib/adapters/generation/prompt.ts
export const REPORT_SYSTEM_PROMPT = `You are a clinical scribe for psychiatrists in India. You receive a transcript of a doctor–patient consultation that may be in Hindi, English, or another Indian language, often code-switched.

Produce a STRUCTURED CLINICAL REPORT IN ENGLISH as a single JSON object with exactly these keys:
- "riskFlags": array of { "category": one of "self-harm"|"suicidal-ideation"|"crisis"|"other", "quote": short verbatim/translated quote, "note": brief clinician-facing note }. Include ONLY clear cues. These are ALERTS, NOT DIAGNOSES. Use [] if none.
- "summary": array of concise English bullet strings capturing the key points of the consultation.
- "medications": array of { "medicine": name, "dose": e.g. "50mg", "timing": { "morning": bool, "afternoon": bool, "night": bool, "custom": optional string }, "duration": e.g. "4 weeks" }. Only include medicines actually discussed. Use [] if none.
- "nextMeeting": either null, or { "agenda": English string, "suggestedAt": ISO datetime string or null }.

Rules:
- Output ENGLISH only, even if the transcript is in another language.
- Output ONLY the JSON object, no prose, no markdown fences.
- Do not invent clinical facts. If something was not discussed, omit it.`;

export function buildUserPrompt(transcript: string): string {
  return `Transcript:\n"""\n${transcript}\n"""`;
}
```

- [ ] **Step 3: Implement the fake**

```ts
// lib/adapters/generation/fake.ts
import type { ReportContent } from "@/lib/domain/report/schema";
import type { ReportGenerator } from "./generator";

export class FakeReportGenerator implements ReportGenerator {
  readonly id = "fake";
  public lastTranscript: string | null = null;

  constructor(
    private readonly content: ReportContent = {
      riskFlags: [],
      summary: ["Patient reports low mood and poor sleep for three weeks."],
      medications: [
        {
          medicine: "Sertraline",
          dose: "50mg",
          timing: { morning: true, afternoon: false, night: false },
          duration: "4 weeks",
        },
      ],
      nextMeeting: { agenda: "Review medication response", suggestedAt: null },
    },
  ) {}

  async generate(transcript: string): Promise<ReportContent> {
    this.lastTranscript = transcript;
    return this.content;
  }
}
```

---

### Task 7: OpenAI report generator (live, JSON mode + validate + repair)

**Files:**

- Create: `lib/adapters/generation/openai-generator.ts`
- Test: `lib/adapters/generation/openai-generator.test.ts`

- [ ] **Step 1: Write the failing test (inject a stub chat client)**

We test the validate/repair logic without hitting the network by injecting a minimal chat-completions client.

```ts
// lib/adapters/generation/openai-generator.test.ts
import { describe, it, expect } from "vitest";
import { OpenAIReportGenerator } from "@/lib/adapters/generation/openai-generator";

function stubClient(responses: string[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: responses[i++] } }],
        }),
      },
    },
  } as never;
}

const valid = JSON.stringify({
  riskFlags: [],
  summary: ["ok"],
  medications: [],
  nextMeeting: null,
});

describe("OpenAIReportGenerator", () => {
  it("parses valid JSON output", async () => {
    const gen = new OpenAIReportGenerator(stubClient([valid]));
    const out = await gen.generate("some transcript");
    expect(out.summary).toEqual(["ok"]);
  });

  it("repairs once when the first output is invalid", async () => {
    const gen = new OpenAIReportGenerator(stubClient(["not json", valid]));
    const out = await gen.generate("some transcript");
    expect(out.summary).toEqual(["ok"]);
  });

  it("throws when output is invalid twice", async () => {
    const gen = new OpenAIReportGenerator(stubClient(["nope", "still nope"]));
    await expect(gen.generate("t")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `yarn vitest run lib/adapters/generation/openai-generator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the generator**

JSON mode + `ReportContentSchema` validation, with a single repair retry. The chat client is injectable for testing; production constructs a real `OpenAI`.

```ts
// lib/adapters/generation/openai-generator.ts
import OpenAI from "openai";
import { env } from "@/lib/config/env";
import {
  ReportContentSchema,
  type ReportContent,
} from "@/lib/domain/report/schema";
import type { ReportGenerator } from "./generator";
import { REPORT_SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

type ChatClient = Pick<OpenAI, "chat">;

export class OpenAIReportGenerator implements ReportGenerator {
  readonly id = "openai";
  private readonly client: ChatClient;

  constructor(client?: ChatClient, apiKey = env.OPENAI_API_KEY) {
    if (client) {
      this.client = client;
    } else {
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
      this.client = new OpenAI({ apiKey });
    }
  }

  async generate(transcript: string): Promise<ReportContent> {
    const messages = [
      { role: "system" as const, content: REPORT_SYSTEM_PROMPT },
      { role: "user" as const, content: buildUserPrompt(transcript) },
    ];

    const first = await this.complete(messages);
    const parsed = this.tryParse(first);
    if (parsed) return parsed;

    // One repair attempt: feed the bad output back and ask for valid JSON only.
    const repair = await this.complete([
      ...messages,
      { role: "assistant" as const, content: first },
      {
        role: "user" as const,
        content:
          "That was not valid JSON matching the schema. Reply with ONLY the corrected JSON object.",
      },
    ]);
    const repaired = this.tryParse(repair);
    if (repaired) return repaired;

    throw new Error(
      "OpenAIReportGenerator: could not obtain valid report JSON",
    );
  }

  private async complete(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
  ): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages,
    });
    return res.choices[0]?.message?.content ?? "";
  }

  private tryParse(raw: string): ReportContent | null {
    try {
      return ReportContentSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `yarn vitest run lib/adapters/generation/openai-generator.test.ts`
Expected: PASS (3 tests).

---

### Task 8: Provider factory for the generator (selection seam)

**Files:** Create `lib/adapters/generation/registry.ts`

- [ ] **Step 1: Implement**

Mirrors the transcription registry so the generator can be swapped later without touching callers.

```ts
// lib/adapters/generation/registry.ts
import type { ReportGenerator } from "./generator";
import { OpenAIReportGenerator } from "./openai-generator";

export function getReportGenerator(): ReportGenerator {
  return new OpenAIReportGenerator();
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Manual smoke test (live, optional — requires keys)

- [ ] Put `OPENAI_API_KEY` in `.env`.
- [ ] Create a throwaway script `scratch/smoke.ts` that reads a small audio file, runs `getTranscriptionProvider('openai').transcribeBatch(...)`, then `getReportGenerator().generate(text)`, and logs the result.
- [ ] Run with `npx tsx scratch/smoke.ts`. Expected: a transcript prints, followed by a valid English `ReportContent` JSON.
- [ ] Delete `scratch/` (do not commit).

## Phase verification

- [ ] `yarn test` — green (registry, generator validate/repair).
- [ ] `npx tsc --noEmit` — no type errors.
- [ ] `getTranscriptionProvider('sarvam'|'amazon'|'openai')` returns the correct provider; `getReportGenerator()` returns the OpenAI generator.

## Definition of done

All three transcription providers implement one interface and are reachable through the registry; the OpenAI generator reliably yields a schema-valid English `ReportContent` (with a repair fallback). Fakes exist for transcription and generation so later phases test deterministically. Ready for Phase 3.
