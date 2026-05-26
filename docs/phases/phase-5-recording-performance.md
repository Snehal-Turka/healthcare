# Phase 5 — Recording & Chunking Fast Path + Performance Instrumentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the PRD §4/§7 speed promise: transcribe **during** recording (segment-by-segment) so the transcript is ready the instant recording stops, then generate the report from that transcript — and surface per-stage timings in the UI.

**Architecture:** A `SegmentRecorder` cycles `MediaRecorder` to emit _complete, independently-decodable_ audio segments every few seconds. The client transcribes each segment via `POST /api/transcribe/chunk` and stitches a rolling transcript live. On stop, the concatenated audio **plus the already-built transcript** are sent to `POST /api/reports`; the orchestrator **skips re-transcription** when a transcript is supplied, so the report streams back in ~the generation time alone. Two pure utilities (`stitchTranscripts`, `mapWithConcurrency`) are unit-tested.

**Tech Stack:** Web `MediaRecorder` + `getUserMedia`, React 19, Vitest. Depends on Phase 4.

> **Feasibility note (honest scope):** Naively byte-splitting one finished upload is **not** safe — only the first `MediaRecorder` blob carries the container header, so arbitrary slices aren't decodable. We therefore make _recording_ fast by transcribing complete cycled segments concurrently with capture (the big win). True server-side splitting of a single uploaded file requires audio decoding (ffmpeg) and is documented as a follow-up; the `mapWithConcurrency` primitive built here is what that follow-up would use.

---

## File structure introduced in this phase

```
lib/domain/pipeline/chunking.ts          # pure: stitchTranscripts + mapWithConcurrency
lib/client/recorder.ts                    # SegmentRecorder (cycled MediaRecorder)
components/capture/Recorder.tsx           # record UI + live rolling transcript
components/report/Timings.tsx             # surfaces stageTimings
app/api/transcribe/chunk/route.ts         # transcribe one segment
```

Modified: `lib/domain/pipeline/orchestrator.ts`, `app/api/reports/route.ts`, `components/report/useReportStream.ts`, `components/report/ReportView.tsx`, `app/page.tsx`.

---

### Task 1: Pure utilities — stitch + concurrency

**Files:**

- Create: `lib/domain/pipeline/chunking.ts`
- Test: `lib/domain/pipeline/chunking.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/domain/pipeline/chunking.test.ts
import { describe, it, expect } from "vitest";
import {
  stitchTranscripts,
  mapWithConcurrency,
} from "@/lib/domain/pipeline/chunking";

describe("stitchTranscripts", () => {
  it("joins parts with a space", () => {
    expect(stitchTranscripts(["a b", "c d"])).toBe("a b c d");
  });
  it("de-duplicates a small word overlap at the seam", () => {
    expect(stitchTranscripts(["hello world", "world how are you"])).toBe(
      "hello world how are you",
    );
  });
  it("handles empty input", () => {
    expect(stitchTranscripts([])).toBe("");
    expect(stitchTranscripts(["", "x"])).toBe("x");
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8]);
  });
  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — Run: `yarn vitest run lib/domain/pipeline/chunking.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/domain/pipeline/chunking.ts
const MAX_OVERLAP_WORDS = 6;

export function stitchTranscripts(parts: string[]): string {
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return "";

  return clean.reduce((acc, next) => {
    if (!acc) return next;
    const accWords = acc.split(/\s+/);
    const nextWords = next.split(/\s+/);
    const max = Math.min(MAX_OVERLAP_WORDS, accWords.length, nextWords.length);
    for (let n = max; n > 0; n--) {
      const tail = accWords.slice(-n).join(" ").toLowerCase();
      const head = nextWords.slice(0, n).join(" ").toLowerCase();
      if (tail === head) return [...accWords, ...nextWords.slice(n)].join(" ");
    }
    return `${acc} ${next}`;
  }, "");
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return results;
}
```

- [ ] **Step 4: Run the test to confirm it passes** — Expected: PASS (5 assertions across 5 tests).

---

### Task 2: Let the orchestrator accept a precomputed transcript

**Files:**

- Modify: `lib/domain/pipeline/orchestrator.ts`
- Modify: `lib/domain/pipeline/orchestrator.test.ts`

- [ ] **Step 1: Add the optional field to `PipelineInput`**

In `lib/domain/pipeline/orchestrator.ts`, change the interface:

```ts
export interface PipelineInput {
  audio: Uint8Array;
  mimeType: string;
  providerId: ProviderId;
  /** When provided (recording path), transcription is skipped — it already happened live. */
  transcript?: string;
}
```

- [ ] **Step 2: Replace the transcribe stage to honor it**

Replace the existing transcribe block (everything between `// 2. transcribe` and the `// 3. generate` comment) with:

```ts
    // 2. transcribe (skipped when a transcript was supplied by the recording path)
    yield { type: 'status', stage: 'transcribing', reportId };
    let text: string;
    let detectedLanguage: string | null;
    if (input.transcript !== undefined) {
      text = input.transcript;
      detectedLanguage = null;
      timings.transcribeMs = 0;
    } else {
      const provider = deps.getProvider(input.providerId);
      const tx = await timed(() => provider.transcribeBatch(input.audio, input.mimeType));
      text = tx.result.text;
      detectedLanguage = tx.result.detectedLanguage ?? null;
      timings.transcribeMs = tx.ms;
    }
    await deps.repo.update(reportId, { transcript: text, detectedLanguage, stageTimings: timings });
    yield { type: 'transcript', reportId, text, detectedLanguage };
```

Then update the `// 3. generate` line to use `text`:

```ts
const gen = await timed(() => deps.generator.generate(text));
```

- [ ] **Step 3: Add a test for the precomputed-transcript path**

Append to `lib/domain/pipeline/orchestrator.test.ts`:

```ts
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
  expect(provider.calls.length).toBe(0); // provider never called
  const final = events.find((e) => e.type === "report") as Extract<
    PipelineEvent,
    { type: "report" }
  >;
  expect(final.report.stageTimings.transcribeMs).toBe(0);
});
```

- [ ] **Step 4: Run the tests** — Run: `yarn vitest run lib/domain/pipeline/orchestrator.test.ts` → PASS (3 tests).

---

### Task 3: Accept a transcript in `POST /api/reports`

**Files:** Modify `app/api/reports/route.ts`

- [ ] **Step 1: Read the optional `transcript` field and pass it through**

In the `POST` handler, after computing `mimeType`, add:

```ts
const transcriptField = form.get("transcript");
const transcript =
  typeof transcriptField === "string" && transcriptField.length
    ? transcriptField
    : undefined;
```

Then change the pipeline call inside the stream to:

```ts
        for await (const event of runReportPipeline({ audio, mimeType, providerId, transcript }, deps)) {
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 4: Chunk transcription endpoint

**Files:** Create `app/api/transcribe/chunk/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/transcribe/chunk/route.ts
import { env } from "@/lib/config/env";
import type { ProviderId } from "@/lib/domain/report/schema";
import { getTranscriptionProvider } from "@/lib/adapters/transcription/registry";

export const dynamic = "force-dynamic";

const VALID: ProviderId[] = ["openai", "sarvam", "amazon"];

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const chunk = form.get("chunk");
  if (!(chunk instanceof File))
    return new Response("chunk is required", { status: 400 });

  const requested = String(form.get("providerId") ?? env.DEFAULT_PROVIDER);
  const providerId = (
    VALID.includes(requested as ProviderId) ? requested : env.DEFAULT_PROVIDER
  ) as ProviderId;

  const audio = new Uint8Array(await chunk.arrayBuffer());
  const provider = getTranscriptionProvider(providerId);
  const res = await provider.transcribeBatch(audio, chunk.type || "audio/webm");
  return Response.json({
    text: res.text,
    detectedLanguage: res.detectedLanguage ?? null,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 5: SegmentRecorder

**Files:** Create `lib/client/recorder.ts`

- [ ] **Step 1: Implement (cycle MediaRecorder to produce complete segments)**

Each segment is a self-contained `audio/webm` blob (the recorder is restarted per segment), so each can be transcribed independently.

```ts
// lib/client/recorder.ts
export interface SegmentRecorderOptions {
  segmentMs?: number;
  onSegment: (segment: Blob, index: number) => void;
}

export class SegmentRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private running = false;
  readonly mimeType: string;

  constructor(private readonly opts: SegmentRecorderOptions) {
    this.mimeType =
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
    });
    this.running = true;
    this.cycle();
    this.timer = setInterval(() => this.flush(), this.opts.segmentMs ?? 4000);
  }

  private cycle(): void {
    if (!this.stream || !this.running) return;
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mimeType });
      if (blob.size > 0) this.opts.onSegment(blob, this.index++);
      if (this.running) this.cycle();
    };
    this.recorder.start();
  }

  private flush(): void {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await new Promise<void>((resolve) => {
      const rec = this.recorder;
      if (rec?.state === "recording") {
        rec.onstop = () => {
          const blob = new Blob(this.chunks, { type: this.mimeType });
          if (blob.size > 0) this.opts.onSegment(blob, this.index++);
          resolve();
        };
        rec.stop();
      } else {
        resolve();
      }
    });
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
```

---

### Task 6: Recorder UI with live rolling transcript

**Files:** Create `components/capture/Recorder.tsx`

- [ ] **Step 1: Implement**

Transcribes each segment as it arrives, stitches the rolling transcript live, and on stop hands the concatenated audio + transcript to the caller.

```tsx
// components/capture/Recorder.tsx
"use client";
import { useRef, useState } from "react";
import type { ProviderId } from "@/lib/domain/report/schema";
import { SegmentRecorder } from "@/lib/client/recorder";
import { stitchTranscripts } from "@/lib/domain/pipeline/chunking";

export function Recorder({
  providerId,
  onComplete,
  disabled,
}: {
  providerId: ProviderId;
  onComplete: (audio: Blob, transcript: string, mimeType: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState("");
  const recorderRef = useRef<SegmentRecorder | null>(null);
  const segmentsRef = useRef<Blob[]>([]);
  const partsRef = useRef<string[]>([]);

  const transcribeSegment = async (segment: Blob) => {
    segmentsRef.current.push(segment);
    const form = new FormData();
    form.append("chunk", segment, "segment.webm");
    form.append("providerId", providerId);
    try {
      const res = await fetch("/api/transcribe/chunk", {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const { text } = (await res.json()) as { text: string };
        partsRef.current.push(text);
        setLive(stitchTranscripts(partsRef.current));
      }
    } catch {
      /* a dropped segment shouldn't stop the consult; keep recording */
    }
  };

  const start = async () => {
    segmentsRef.current = [];
    partsRef.current = [];
    setLive("");
    const rec = new SegmentRecorder({
      segmentMs: 4000,
      onSegment: (seg) => void transcribeSegment(seg),
    });
    recorderRef.current = rec;
    await rec.start();
    setRecording(true);
  };

  const stop = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    await rec.stop();
    setRecording(false);
    // allow the final segment's transcription to settle
    await new Promise((r) => setTimeout(r, 300));
    const audio = new Blob(segmentsRef.current, { type: rec.mimeType });
    onComplete(audio, stitchTranscripts(partsRef.current), rec.mimeType);
  };

  return (
    <div className="space-y-2">
      {!recording ? (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          ● Record consultation
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          ■ Stop &amp; generate
        </button>
      )}
      {recording && (
        <p className="text-xs text-neutral-500">
          Recording — transcribing live…
        </p>
      )}
      {live && (
        <p className="rounded-md border border-neutral-200 p-2 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          {live}
        </p>
      )}
    </div>
  );
}
```

---

### Task 7: Wire recording into the home page + extend the stream hook

**Files:**

- Modify: `components/report/useReportStream.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: Let `submit` carry an optional transcript**

In `components/report/useReportStream.ts`, change the `submit` signature and body:

```ts
  const submit = useCallback(async (audio: Blob, providerId: ProviderId, filename = 'consult.webm', transcript?: string) => {
    setStage('ingesting');
    setTranscript('');
    setReport(null);
    setError(null);

    const form = new FormData();
    form.append('audio', audio, filename);
    form.append('providerId', providerId);
    if (transcript) form.append('transcript', transcript);
    // ...unchanged: fetch '/api/reports', read NDJSON, handleEvent
```

(The rest of the function is unchanged.)

- [ ] **Step 2: Add the recorder to the home page**

In `app/page.tsx`, add a provider state and render `Recorder` next to `UploadPanel`. Import them:

```tsx
import { useState } from "react";
import { Recorder } from "@/components/capture/Recorder";
```

Inside `Home`, add:

```tsx
const [provider, setProvider] = useState<ProviderId>("openai");
```

Render after `<UploadPanel ... />`:

```tsx
<div className="rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-lg font-medium">Record live</h2>
  </div>
  <Recorder
    providerId={provider}
    disabled={busy}
    onComplete={(audio, transcript, mimeType) =>
      submit(
        audio,
        provider,
        `consult.${mimeType.includes("webm") ? "webm" : "audio"}`,
        transcript,
      )
    }
  />
</div>
```

> Keep the existing `UploadPanel` for the upload path. (Optionally lift its internal provider state to the shared `provider` so both paths use one selector; not required for the demo.)

- [ ] **Step 3: Verify recording end-to-end**

Run: `yarn dev`. Click **Record**, speak a short Hindi/English consult, watch the live transcript build, click **Stop & generate**. Expected: the report streams in within ~1–2 s of stopping (transcription already done), because `transcribeMs` is 0 on this path.

---

### Task 8: Surface stage timings

**Files:**

- Create: `components/report/Timings.tsx`
- Modify: `components/report/ReportView.tsx`

- [ ] **Step 1: Timings component**

```tsx
// components/report/Timings.tsx
import type { StageTimings } from "@/lib/domain/report/schema";

export function Timings({ timings }: { timings: StageTimings }) {
  const total =
    (timings.ingestMs ?? 0) +
    (timings.transcribeMs ?? 0) +
    (timings.generateMs ?? 0);
  const cell = (label: string, ms?: number) => (
    <span className="rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
      {label}: {ms ?? 0} ms
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2 text-xs text-neutral-500 print:hidden">
      {cell("Ingest", timings.ingestMs)}
      {cell("Transcribe", timings.transcribeMs)}
      {cell("Generate", timings.generateMs)}
      <span className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        Total: {total} ms
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Render it in `ReportView`**

In `components/report/ReportView.tsx`, import and render below `ReportActions`:

```tsx
import { Timings } from "./Timings";
```

```tsx
      <ReportActions content={content} freeVisitDeadline={report.freeVisitDeadline} medicineExpiryDate={report.medicineExpiryDate} />
      <Timings timings={report.stageTimings} />
```

---

## Phase verification

- [ ] `yarn test` — green (chunking utils + the new orchestrator case).
- [ ] `npx tsc --noEmit` — clean.
- [ ] **Recording demo:** `yarn dev` → Record → live transcript builds during the consult → Stop → report streams in within ~1–2 s; the Timings strip shows `Transcribe: 0 ms` on this path.
- [ ] **Upload still works:** the Phase 4 upload path is unchanged and shows real `Transcribe` timing.
- [ ] Latency is observable against the PRD §4 budget via the Timings strip.

## Definition of done

A doctor can record a consultation in the browser; segments are transcribed live so the transcript is complete at stop; the report is generated from that transcript and streams back in ~the generation time alone. Per-stage timings are visible. Pure stitch/concurrency utilities are tested. (Server-side splitting of a single uploaded file via audio decoding is left as a documented follow-up.)

---

## MVP complete

With Phases 1–5 done, the PRD MVP is delivered: record **or** upload → swappable transcription (OpenAI live, Sarvam/Amazon ready) → streamed, editable **English** report (risk flags, summary, medication table, next meeting, computed free-visit and medicine-expiry deadlines) → copy + PDF/print → saved history — built on a layered, dependency-inverted architecture with a fast recording path and surfaced latency.
