# Phase 3 — Processing Pipeline & API — DONE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Wire the adapters into a staged pipeline (`ingest → transcribe → generate → finalize`) with per-stage timing, expose it through a **streaming** `POST /api/reports` plus `GET` endpoints, and persist every report. Result: a working backend you can drive end-to-end with `curl`.

**Architecture:** `runReportPipeline` is an async generator that yields events (`status`, `transcript`, `report`, `error`) so callers can stream progress. It depends only on interfaces (`ReportRepository`, `Storage`, transcription registry, `ReportGenerator`) injected via a `PipelineDeps` object — pure orchestration, no framework imports. A `productionDeps()` factory wires the real implementations; route handlers stay thin and serialize events as NDJSON via the Web Streams API.

**Tech Stack:** Next.js 16 route handlers + Web Streams, Vitest. Depends on Phases 1–2.

---

## File structure introduced in this phase

```
lib/domain/pipeline/timing.ts          # timed() helper
lib/domain/pipeline/orchestrator.ts     # runReportPipeline (async generator) + PipelineEvent
lib/domain/pipeline/deps.ts             # productionDeps() factory
lib/adapters/repository/memory-report-repository.ts   # in-memory repo (tests + ephemeral)
lib/adapters/storage/memory-storage.ts                # in-memory storage (tests)
app/api/reports/route.ts                # POST (stream) + GET (list)
app/api/reports/[id]/route.ts           # GET one
```

---

### Task 1: Timing helper

**Files:**

- Create: `lib/domain/pipeline/timing.ts`
- Test: `lib/domain/pipeline/timing.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// lib/domain/pipeline/timing.test.ts
import { describe, it, expect } from "vitest";
import { timed } from "@/lib/domain/pipeline/timing";

describe("timed", () => {
  it("returns the result and a non-negative duration", async () => {
    const { result, ms } = await timed(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(result).toBe(42);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `yarn vitest run lib/domain/pipeline/timing.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// lib/domain/pipeline/timing.ts
export async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}
```

- [x] **Step 4: Run the test to confirm it passes** — Expected: PASS.

---

### Task 2: In-memory test doubles (repository + storage)

**Files:**

- Create: `lib/adapters/repository/memory-report-repository.ts`
- Create: `lib/adapters/storage/memory-storage.ts`

These let the orchestrator (and Phase 3 route tests) run without a database or filesystem.

- [x] **Step 1: Implement the in-memory repository**

```ts
// lib/adapters/repository/memory-report-repository.ts
import { randomUUID } from "node:crypto";
import type {
  CreateReportInput,
  ReportRecord,
  ReportRepository,
} from "./report-repository";

export class MemoryReportRepository implements ReportRepository {
  private readonly store = new Map<string, ReportRecord>();

  async create(input: CreateReportInput): Promise<ReportRecord> {
    const now = new Date().toISOString();
    const record: ReportRecord = {
      id: randomUUID(),
      status: "processing",
      providerId: input.providerId,
      audioRef: input.audioRef,
      detectedLanguage: null,
      transcript: null,
      content: null,
      freeVisitDeadline: null,
      medicineExpiryDate: null,
      stageTimings: {},
      error: null,
      createdAt: now,
      generatedAt: null,
    };
    this.store.set(record.id, record);
    return record;
  }

  async update(
    id: string,
    patch: Partial<ReportRecord>,
  ): Promise<ReportRecord> {
    const current = this.store.get(id);
    if (!current) throw new Error(`Report not found: ${id}`);
    const next = { ...current, ...patch, id: current.id };
    this.store.set(id, next);
    return next;
  }

  async get(id: string): Promise<ReportRecord | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<ReportRecord[]> {
    return [...this.store.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
```

- [x] **Step 2: Implement the in-memory storage**

```ts
// lib/adapters/storage/memory-storage.ts
import type { Storage } from "./storage";

export class MemoryStorage implements Storage {
  private readonly store = new Map<string, Uint8Array>();

  async save(key: string, data: Uint8Array, _contentType: string): Promise<string> {
    this.store.set(key, data);
    return `mem:${key}`;
  }

  async load(ref: string): Promise<Uint8Array> {
    const key = ref.startsWith("mem:") ? ref.slice("mem:".length) : ref;
    const data = this.store.get(key);
    if (!data) throw new Error(`Not found: ${ref}`);
    return data;
  }
}
```

---

### Task 3: The pipeline orchestrator

**Files:**

- Create: `lib/domain/pipeline/orchestrator.ts`
- Test: `lib/domain/pipeline/orchestrator.test.ts`

- [x] **Step 1: Write the failing integration test (all fakes)**

```ts
// lib/domain/pipeline/orchestrator.test.ts
import { describe, it, expect } from "vitest";
import {
  runReportPipeline,
  type PipelineEvent,
} from "@/lib/domain/pipeline/orchestrator";
import { MemoryReportRepository } from "@/lib/adapters/repository/memory-report-repository";
import { MemoryStorage } from "@/lib/adapters/storage/memory-storage";
import { FakeTranscriptionProvider } from "@/lib/adapters/transcription/fake";
import { FakeReportGenerator } from "@/lib/adapters/generation/fake";

function deps(repo = new MemoryReportRepository()) {
  return {
    repo,
    storage: new MemoryStorage(),
    getProvider: () =>
      new FakeTranscriptionProvider("openai", {
        text: "kuch low feel ho raha hai",
        detectedLanguage: "hi",
      }),
    generator: new FakeReportGenerator(),
    now: () => new Date("2026-05-25T09:00:00.000Z"),
  };
}

async function collect(gen: AsyncGenerator<PipelineEvent>) {
  const events: PipelineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("runReportPipeline", () => {
  it("emits status, transcript, and a final ready report with computed deadlines", async () => {
    const repo = new MemoryReportRepository();
    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1, 2, 3]),
          mimeType: "audio/webm",
          providerId: "openai",
        },
        deps(repo),
      ),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("transcript");
    const final = events.find((e) => e.type === "report") as Extract<
      PipelineEvent,
      { type: "report" }
    >;
    expect(final.report.status).toBe("ready");
    expect(final.report.transcript).toContain("low feel");
    expect(final.report.content?.medications[0].medicine).toBe("Sertraline");
    expect(final.report.freeVisitDeadline).toBe("2026-05-28T09:00:00.000Z");
    expect(final.report.medicineExpiryDate).toBe("2026-07-25T09:00:00.000Z");
    expect(final.report.stageTimings.transcribeMs).toBeGreaterThanOrEqual(0);

    // persisted
    const persisted = await repo.get(final.report.id);
    expect(persisted?.status).toBe("ready");
  });

  it("marks the report failed and emits an error event when transcription throws", async () => {
    const repo = new MemoryReportRepository();
    const d = {
      ...deps(repo),
      getProvider: () => ({
        id: "openai" as const,
        supportsStreaming: false,
        transcribeBatch: async () => {
          throw new Error("stt down");
        },
      }),
    };
    const events = await collect(
      runReportPipeline(
        {
          audio: new Uint8Array([1]),
          mimeType: "audio/webm",
          providerId: "openai",
        },
        d,
      ),
    );
    const err = events.find((e) => e.type === "error") as Extract<
      PipelineEvent,
      { type: "error" }
    >;
    expect(err.message).toContain("stt down");
    const persisted = err.reportId ? await repo.get(err.reportId) : null;
    expect(persisted?.status).toBe("failed");
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `yarn vitest run lib/domain/pipeline/orchestrator.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the orchestrator**

```ts
// lib/domain/pipeline/orchestrator.ts
import { randomUUID } from "node:crypto";
import type { ProviderId, StageTimings } from "@/lib/domain/report/schema";
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
}

export async function* runReportPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): AsyncGenerator<PipelineEvent> {
  const now = deps.now ?? (() => new Date());
  const timings: StageTimings = {};
  let reportId: string | null = null;

  try {
    const ext = input.mimeType.includes("mp4")
      ? "mp4"
      : input.mimeType.includes("wav")
        ? "wav"
        : "webm";
    const ingest = await timed(async () => {
      const audioRef = await deps.storage.save(
        `${randomUUID()}.${ext}`,
        input.audio,
        input.mimeType,
      );
      return deps.repo.create({ providerId: input.providerId, audioRef });
    });
    timings.ingestMs = ingest.ms;
    reportId = ingest.result.id;
    yield { type: "status", stage: "ingesting", reportId };

    yield { type: "status", stage: "transcribing", reportId };
    const provider = deps.getProvider(input.providerId);
    const tx = await timed(() =>
      provider.transcribeBatch(input.audio, input.mimeType),
    );
    timings.transcribeMs = tx.ms;
    await deps.repo.update(reportId, {
      transcript: tx.result.text,
      detectedLanguage: tx.result.detectedLanguage ?? null,
      stageTimings: timings,
    });
    yield {
      type: "transcript",
      reportId,
      text: tx.result.text,
      detectedLanguage: tx.result.detectedLanguage ?? null,
    };

    yield { type: "status", stage: "generating", reportId };
    const gen = await timed(() => deps.generator.generate(tx.result.text));
    timings.generateMs = gen.ms;

    yield { type: "status", stage: "finalizing", reportId };
    const generatedAt = now();
    const finalized = await deps.repo.update(reportId, {
      status: "ready",
      content: gen.result,
      stageTimings: timings,
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
```

- [x] **Step 4: Run the test to confirm it passes**

Run: `yarn vitest run lib/domain/pipeline/orchestrator.test.ts`
Expected: PASS (2 tests).

---

### Task 4: Production deps factory

**Files:** Create `lib/domain/pipeline/deps.ts`

- [x] **Step 1: Implement**

```ts
// lib/domain/pipeline/deps.ts
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";
import { LocalStorage } from "@/lib/adapters/storage/local-storage";
import { getTranscriptionProvider } from "@/lib/adapters/transcription/registry";
import { getReportGenerator } from "@/lib/adapters/generation/registry";
import type { PipelineDeps } from "./orchestrator";

export function productionDeps(): PipelineDeps {
  return {
    repo: new PrismaReportRepository(prisma),
    storage: new LocalStorage(env().STORAGE_DIR),
    getProvider: (id) => getTranscriptionProvider(id),
    generator: getReportGenerator(),
  };
}
```

- [x] **Step 2: Type-check** — `npx tsc --noEmit` — clean.

---

### Task 5: `POST /api/reports` (streaming) + `GET /api/reports` (list)

**Files:** Create `app/api/reports/route.ts`

- [x] **Step 1: Implement the route handler**

`POST` accepts multipart (`audio` file + optional `providerId`), runs the pipeline, and streams events as NDJSON. `GET` lists saved reports. `force-dynamic` prevents any caching of these dynamic responses.

```ts
// app/api/reports/route.ts
import { env } from "@/lib/config/env";
import type { ProviderId } from "@/lib/domain/report/schema";
import { runReportPipeline } from "@/lib/domain/pipeline/orchestrator";
import { productionDeps } from "@/lib/domain/pipeline/deps";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";

export const dynamic = "force-dynamic";

const VALID: ProviderId[] = ["openai", "sarvam", "amazon"];

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File))
    return new Response("audio file is required", { status: 400 });

  const requested = String(form.get("providerId") ?? env().DEFAULT_PROVIDER);
  const providerId = (
    VALID.includes(requested as ProviderId) ? requested : env().DEFAULT_PROVIDER
  ) as ProviderId;

  const audio = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || "audio/webm";
  const deps = productionDeps();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runReportPipeline(
          { audio, mimeType, providerId },
          deps,
        )) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", reportId: null, message }) + "\n",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(): Promise<Response> {
  const repo = new PrismaReportRepository(prisma);
  return Response.json(await repo.list());
}
```

- [x] **Step 2: Type-check** — `npx tsc --noEmit` — clean.

---

### Task 6: `GET /api/reports/[id]`

**Files:** Create `app/api/reports/[id]/route.ts`

- [x] **Step 1: Implement (Next 16 async params via RouteContext)**

```ts
// app/api/reports/[id]/route.ts
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/reports/[id]">,
): Promise<Response> {
  const { id } = await ctx.params;
  const repo = new PrismaReportRepository(prisma);
  const report = await repo.get(id);
  if (!report) return new Response("not found", { status: 404 });
  return Response.json(report);
}
```

- [x] **Step 2: Type-check** — `npx tsc --noEmit` — clean.

---

## Manual end-to-end smoke (live)

- [ ] Ensure `.env` has `DATABASE_URL`, `OPENAI_API_KEY`, and `DEFAULT_PROVIDER=openai`.
- [ ] `yarn dev`
- [ ] Stream a report from a sample clip:

```bash
curl -N -F "audio=@sample.m4a" -F "providerId=openai" http://localhost:3000/api/reports
```

Expected: NDJSON lines stream — `status` events, then a `transcript` event, then a final `report` event whose `content` is a valid English report and whose `freeVisitDeadline`/`medicineExpiryDate` are populated.

- [ ] `curl http://localhost:3000/api/reports` lists the report; `curl http://localhost:3000/api/reports/<id>` returns it.

## Phase verification

- [x] `yarn test` — green (timing, orchestrator incl. failure path).
- [x] `npx tsc --noEmit` — clean.
- [ ] Manual curl smoke streams a valid report and persists it across a server restart.

## Definition of done

A single `POST /api/reports` call ingests audio, transcribes (any provider), generates an English report, computes deadlines, persists it, and streams progress as NDJSON. `GET` endpoints list and fetch reports. The orchestrator is framework-free and fully covered by an integration test using fakes. Ready for the UI in Phase 4.
