# Implementation Phases — AI Consultation Scribe

These are executable, phase-wise implementation plans derived from [`../PRD.md`](../PRD.md). They are written for **AI agents to execute one phase at a time**. Each phase produces working, tested software and depends only on the phases before it.

## How to execute a phase

1. Open the phase file and use **`superpowers:subagent-driven-development`** (recommended) or **`superpowers:executing-plans`**.
2. Work top-to-bottom. Steps use checkbox (`- [ ]`) syntax — check them off as you go.
3. Run the verification block at the end of the phase. Do not start the next phase until the current one is green.

## Phase order & dependencies

| Phase | File                                                                     | Depends on | Status | Outcome                                                                      |
| ----- | ------------------------------------------------------------------------ | ---------- | ------ | ---------------------------------------------------------------------------- |
| 1     | [`phase-1-foundation.md`](./phase-1-foundation.md)                       | —          | ✅ Done | Domain types, deadline rules, DB, storage & repository. Unit-tested.         |
| 2     | [`phase-2-adapters.md`](./phase-2-adapters.md)                           | 1          | ✅ Done | Swappable STT providers (OpenAI live) + OpenAI report generator, with fakes. |
| 3     | [`phase-3-pipeline-api.md`](./phase-3-pipeline-api.md)                   | 1, 2       | ✅ Done | Pipeline orchestrator + streaming REST API. End-to-end backend.              |
| 4     | [`phase-4-frontend.md`](./phase-4-frontend.md)                           | 3          | ✅ Done | Upload capture → streaming editable report → copy/PDF → history. Demoable.   |
| 5     | [`phase-5-recording-performance.md`](./phase-5-recording-performance.md) | 4          |        | Record-with-chunking fast path, parallel-chunk uploads, surfaced timings.    |

## Project conventions (apply to every phase)

- **Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 + TypeScript. Package manager: **yarn** (a `yarn.lock` exists).
- **Import alias:** `@/*` → repo root (e.g. `import { env } from '@/lib/config/env'`).
- **Testing:** **Vitest**, co-located `*.test.ts`. Tests use **fakes** — never call live provider APIs in tests. Live providers are checked via the documented manual smoke step in each phase.
- **Architecture (PRD §11) — layered, dependency-inverted, small focused files:**
  ```
  lib/config/env.ts                              # typed, zod-validated env
  lib/db/prisma.ts                               # PrismaClient singleton
  lib/domain/report/{schema.ts,rules.ts}         # pure: zod schema + deadline math
  lib/domain/pipeline/{timing.ts,chunking.ts,orchestrator.ts}
  lib/adapters/transcription/{provider.ts,registry.ts,openai.ts,sarvam.ts,amazon.ts,fake.ts}
  lib/adapters/generation/{generator.ts,prompt.ts,openai-generator.ts,fake.ts}
  lib/adapters/storage/{storage.ts,local-storage.ts}
  lib/adapters/repository/{report-repository.ts,prisma-report-repository.ts}
  lib/client/recorder.ts
  components/capture/*  components/report/*       # 'use client' UI
  app/page.tsx  app/history/page.tsx  app/report/[id]/page.tsx
  app/api/reports/route.ts  app/api/reports/[id]/route.ts  app/api/transcribe/chunk/route.ts
  prisma/schema.prisma
  ```
- **Next.js 16 — breaking changes to respect** (this version differs from older docs; read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` if unsure):
  - `params`, `searchParams`, `headers()`, `cookies()` are **async** — always `await` them.
  - Route handlers with dynamic segments: `export async function GET(req: Request, ctx: RouteContext<'/api/reports/[id]'>) { const { id } = await ctx.params }`.
  - Streaming from a route handler uses the **Web Streams API**: `new ReadableStream({ async start(controller) { controller.enqueue(encoder.encode(...)); controller.close() } })`.
  - Turbopack is the default bundler; `'use client'` marks Client Components.
  - Node **20.9+** required.

## Design philosophy (carry through every phase)

Build like a senior engineer: **core domain has zero framework/SDK imports**; all I/O (STT, LLM, DB, storage) sits behind interfaces with fakes; route handlers are thin; UI holds no business logic. The pipeline runs in-request now but is shaped so it could move to a queue/worker later without changing callers. Keep files focused — split when one grows past a single clear responsibility.

## Disclaimer carried into the product

Generated reports are AI drafts and must be reviewed/edited by the doctor before any clinical use. Risk/safety flags are **alerts, not diagnoses**. (Surfaced in the UI in Phase 4.)
