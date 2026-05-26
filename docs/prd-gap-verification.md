# PRD Gap Verification

Date: 2026-05-25 (priority pass added 2026-05-26; high-priority fixes landed 2026-05-26)

Scope: compared `docs/PRD.md` against the current app, API, domain, adapter, Prisma, and UI code. This file records gaps found during verification, now ordered by demo impact.

## Resolved (2026-05-26)

All four 🔴 **Fix before demo** items are now implemented:

- **#1 Section-by-section streaming** — the OpenAI generator streams NDJSON section lines; the pipeline emits a `section` event per parsed section; the homepage renders them progressively (`StreamingReportView`) before the final report.
- **#5 (persist) Saved edits** — `PATCH /api/reports/[id]` persists edited content; a "Save changes" button surfaces it in the UI. (Finer editing controls remain deferred — see below.)
- **#7 Provider default** — the homepage now defaults the dropdown to `env().DEFAULT_PROVIDER` via a server wrapper.
- **#8 (retry) Failure recovery** — a "Retry" button re-runs the last submission; `/api/transcribe/chunk` now returns a clean `502` on provider errors. (Adapter backoff remains deferred.)

The 🟡/🟢 items below are unchanged and still open.

## How to read this

Each gap is tagged with a recommendation:

- 🔴 **Fix before demo** — directly visible in a short demo, or risks an embarrassing live failure.
- 🟡 **Fix before demo *if in script*** — high impact only if that specific flow (upload / live recording) is part of the demo run.
- 🟢 **Fix after demo** — architecture, resilience, or polish that a short demo will not surface.

"Effort" is a rough build estimate (Low / Med / High), not exact.

## Priority summary

| # | Gap | Demo impact | Effort | Recommendation |
|---|-----|-------------|--------|----------------|
| 1 | Report content not streamed section-by-section | High — headline "first section < 2s" wow | Med | ✅ Done |
| 5 | Report edits not persisted (and partial editability) | High — editing is core; lost edits look broken | Low (persist) / Med (rest) | ✅ Done (persist) / 🟢 After (rest) |
| 8 | No failure retry path | Med — live-demo safety net | Low (button) / Med (adapter backoff) | ✅ Done (button) / 🟢 After (backoff) |
| 7 | Homepage provider default ignores env config | Low — but trivial fix, avoids confusion | Low | ✅ Done |
| 2 | Uploaded audio not chunked / parallel / direct-to-storage | High *if uploads are demoed* | High | 🟡 Before if in script |
| 4 | Recording lacks VAD/overlap, may cut words | Med *if live recording is the hero flow* | Med | 🟡 Before if in script |
| 3 | `supportsStreaming` declared but not implemented | Low — not user-visible in demo | Med | 🟢 After |
| 6 | History not searchable | Low — reopen works without it | Low–Med | 🟢 After |
| 9 | Deployment scale path (S3 / Postgres) partial | None — explicitly fine for local demo | Med | 🟢 After |

---

## Tier 1 — Fix before demo (highest demo impact)

### 1. Report content is not streamed section-by-section ✅ Done

**Demo impact: High** — this is the headline latency promise. **Effort: Med.**

**Implemented (2026-05-26):** the OpenAI generator now streams NDJSON section lines (`lib/adapters/generation/openai-generator.ts` `generateStream`, prompt in `prompt.ts`, parser `parseSectionLine` in `lib/domain/report/schema.ts`). The orchestrator emits a `section` event per parsed section (`lib/domain/pipeline/orchestrator.ts`), `useReportStream` accumulates a `partial` report, and `components/report/StreamingReportView.tsx` renders sections progressively (with skeletons) before the final report event.

PRD expectation:
- Live status and the report should stream as it is produced (`docs/PRD.md:33`).
- OpenAI output should stream into the UI so sections fill progressively (`docs/PRD.md:59`, `docs/PRD.md:130`).
- `POST /api/reports` should stream report content to the client (`docs/PRD.md:136`).

Current implementation:
- `OpenAIReportGenerator.generate()` waits for a full chat completion and parses one full JSON object (`lib/adapters/generation/openai-generator.ts:26-66`).
- The pipeline only emits a final `{ type: "report" }` event after generation completes (`lib/domain/pipeline/orchestrator.ts:101-116`).
- The UI only renders `ReportView` after that final report event (`components/report/useReportStream.ts:63-72`, `app/page.tsx:67`).

Impact:
- The first report section cannot appear before the full model response is complete, so the PRD latency target of first section visible in under 2 seconds after stop is not actually implemented.

**Recommendation: Before demo.** This is the single most visible "wow" gap — a demo that shows sections populating live reads as fast and polished; a multi-second blank wait reads as slow.

### 5. Report editability and saved edits are incomplete ✅ Done (persist) / 🟢 (rest)

**Demo impact: High for persistence** (editing then losing the edit looks broken); **lower for the finer controls**. **Effort: Low to persist, Med for the rest.**

**Implemented (2026-05-26):** `PATCH /api/reports/[id]` validates and persists edited `content` via the existing `repo.update()` (`app/api/reports/[id]/route.ts`), and a "Save changes" button in `components/report/ReportActions.tsx` calls it. Edits now survive refresh/reopen (the `/report/[id]` page reads persisted `content`). **Still deferred (🟢):** summary reorder, custom medication timing, risk-flag editing, and hiding Next Meeting when `null`.

PRD expectation:
- Every report field should be editable (`docs/PRD.md:21`, `docs/PRD.md:31`, `docs/PRD.md:75-86`).
- Summary items can be added, removed, and reordered (`docs/PRD.md:80`).
- Medication timing supports Morning / Afternoon / Night / Custom (`docs/PRD.md:81`).
- Next Meeting is conditional and shown only if follow-up is implied (`docs/PRD.md:82`).
- Reopened reports can be edited and re-exported (`docs/PRD.md:71`).

Current implementation:
- Risk flags are display-only, with no edit/add/remove controls (`components/report/RiskFlags.tsx:4-28`).
- Summary supports add/remove/edit, but not reorder (`components/report/SummaryList.tsx:10-40`).
- Medication timing supports morning/afternoon/night checkboxes, but no custom timing field (`components/report/MedicationTable.tsx:57-83`).
- The Next Meeting section is always rendered, even when the model returns `null`; it shows an add button rather than hiding the section (`components/report/ReportView.tsx:67-72`, `components/report/NextMeeting.tsx:10-18`).
- `ReportView` edits local React state only (`components/report/ReportView.tsx:34-77`). There is no PATCH/PUT route or save action to persist doctor edits back to history.

Impact:
- The displayed draft is partly editable, but not every PRD field/behavior is covered, and edits are lost after refresh or reopening another session.

**Recommendation: Persist before demo, refine after.**
- **Before:** add a PATCH/PUT save path so doctor edits survive refresh/reopen. Demoing an edit that vanishes is worse than not demoing editing at all.
- **After:** summary reorder, custom medication timing, risk-flag editing, and hiding Next Meeting when `null`. Nice to have but unlikely to derail a short demo.

### 8. Failure retry and adapter retry behavior are missing ✅ Done (retry button) / 🟢 (backoff)

**Demo impact: Med** — a failure mid-demo with no recovery is a dead end. **Effort: Low for a retry button, Med for adapter backoff.**

**Implemented (2026-05-26):** `useReportStream` retains the last submission and exposes `retry()`; the homepage shows a "Retry" button next to the error note (`app/HomeClient.tsx`). `/api/transcribe/chunk` now wraps the provider call and returns a clean `502` JSON error instead of a raw route failure. **Still deferred (🟢):** typed retry/backoff inside the provider adapters.

PRD expectation:
- Failures should set `status = failed` with a user-visible message and a retry (`docs/PRD.md:138`).
- Adapter boundaries should use typed error handling and retries (`docs/PRD.md:153`).

Current implementation:
- The pipeline marks created reports failed and emits an error event (`lib/domain/pipeline/orchestrator.ts:117-125`).
- The UI displays the error string but provides no retry action (`components/report/useReportStream.ts:69-72`, `app/page.tsx:54-58`).
- `/api/transcribe/chunk` does not catch provider errors, so recording chunk failures become raw route failures (`app/api/transcribe/chunk/route.ts:9-35`).
- Provider adapters do not implement retry/backoff around external API calls.

Impact:
- Basic failure state exists, but the user recovery path and adapter resilience promised by the PRD are incomplete.

**Recommendation: Add the retry button before demo, adapter backoff after.** A visible "Retry" gives you a live recovery path if a provider call hiccups on stage. Backoff/typed retries inside adapters are resilience hardening that can follow.

### 7. Homepage provider default ignores env config ✅ Done

**Demo impact: Low, but the fix is trivial and removes a confusing mismatch.** **Effort: Low.**

**Implemented (2026-05-26):** `app/page.tsx` is now a server component that reads `env().DEFAULT_PROVIDER` and passes it to the new `app/HomeClient.tsx`, which seeds the dropdown state. The visible default now matches server config.

PRD expectation:
- The homepage provider dropdown defaults to env config (`docs/PRD.md:66`, `docs/PRD.md:120`).

Current implementation:
- `app/page.tsx` hardcodes the initial provider state to `"openai"` (`app/page.tsx:11-17`).
- Server routes fall back to `env().DEFAULT_PROVIDER`, but the visible homepage dropdown does not.

Impact:
- Deployments configured with Sarvam or Amazon as the default still show OpenAI selected on first load.

**Recommendation: Before demo (quick win).** If the demo runs on OpenAI this is invisible, but it is a near-zero-cost fix that prevents the dropdown contradicting the configured provider.

---

## Tier 2 — Fix before demo only if that flow is in the script

### 2. Uploaded audio is not chunked, parallelized, or uploaded directly to storage 🟡

**Demo impact: High *if you demo uploading a long consult* — PRD demo success explicitly calls this out.** **Effort: High.**

PRD expectation:
- Uploaded audio transcription should take roughly the longest parallel chunk plus merge time, not full file duration (`docs/PRD.md:52`).
- Uploads should split on silence/VAD or overlap chunks, transcribe concurrently, then stitch (`docs/PRD.md:58`, `docs/PRD.md:98`).
- Uploads should go directly to storage via presigned URL (`docs/PRD.md:60`, `docs/PRD.md:67`, `docs/PRD.md:168`).
- Demo success includes uploaded audio confirming parallel-chunk transcription keeps it fast (`docs/PRD.md:182`).

Current implementation:
- `/api/reports` receives the whole multipart file, materializes it into memory, then passes the full buffer through the pipeline (`app/api/reports/route.ts:12-30`).
- The orchestrator saves the full audio buffer through local storage and calls `provider.transcribeBatch(input.audio, input.mimeType)` once (`lib/domain/pipeline/orchestrator.ts:61-87`).
- `mapWithConcurrency()` exists but is not used by the upload path (`lib/domain/pipeline/chunking.ts:28-47`).
- There is no presigned upload route or S3-compatible storage adapter for app uploads.

Impact:
- Uploaded consults remain serial and app-server-bound, so the PRD's upload latency budget and direct-storage architecture are not met.

**Recommendation: Before demo only if upload is in the script; otherwise after.** If the demo features uploading a long file, serial transcription will be visibly slow and this jumps to Tier 1. If the demo uses live recording only, defer — this is the largest single effort here. Parallel chunking (reuse `mapWithConcurrency`) gives most of the demo win; direct-to-storage presigned upload can follow separately.

### 4. Recording fast path is chunked-batch only and lacks VAD/overlap handling 🟡

**Demo impact: Med *if live recording is the hero flow* — cut words show up in the transcript.** **Effort: Med.**

PRD expectation:
- MediaRecorder emits 3-5 second chunks during capture (`docs/PRD.md:92`).
- Boundary handling should use silence/VAD or small overlaps to avoid cutting words, then de-duplicate on stitch (`docs/PRD.md:96`).

Current implementation:
- `SegmentRecorder` cycles MediaRecorder every 4 seconds and sends complete segments while recording (`lib/client/recorder.ts:23-77`), which covers part of the requirement.
- Segments are not produced with silence/VAD and do not include overlap (`lib/client/recorder.ts:55-77`).
- Stitching only de-duplicates repeated words if overlap happens to be present (`lib/domain/pipeline/chunking.ts:1-26`).

Impact:
- The live recording path is faster than full serial transcription, but it does not fully implement the PRD's boundary strategy and may cut words at segment edges.

**Recommendation: Before demo only if live recording is the centerpiece.** It works today and is fast; the risk is a visibly mangled word at a segment boundary. A small fixed overlap + the existing dedup is a cheaper interim than full VAD and removes most boundary artifacts. Full VAD is post-demo.

---

## Tier 3 — Fix after demo (not visible in a short demo)

### 3. Provider streaming capability is declared but not implemented or selected 🟢

**Demo impact: Low** — internal capability flag, not user-visible. **Effort: Med.**

PRD expectation:
- Providers expose `supportsStreaming` and optional `transcribeStream()` (`docs/PRD.md:103-117`).
- When a provider supports realtime, chunks should stream over WebSocket and partial transcripts return live (`docs/PRD.md:93-97`).
- OpenAI and Amazon should support realtime/streaming where available (`docs/PRD.md:122-124`).

Current implementation:
- `TranscriptionProvider` includes optional `transcribeStream()` (`lib/adapters/transcription/provider.ts:11-18`), but no concrete provider implements it.
- OpenAI and Amazon both set `supportsStreaming = true` (`lib/adapters/transcription/openai.ts:5-8`, `lib/adapters/transcription/amazon.ts:10-12`) while only implementing batch transcription.
- Recording chunks are posted to `/api/transcribe/chunk`, which always calls `provider.transcribeBatch()` (`app/api/transcribe/chunk/route.ts:24-29`).
- The pipeline never branches on `supportsStreaming`.

Impact:
- The capability flag is misleading, and the automatic streaming-vs-batch behavior described in the PRD is absent.

**Recommendation: After demo.** The chunked-batch recording path already delivers the perceived speed. As an interim, set `supportsStreaming = false` so the flag is not misleading. Real `transcribeStream()` + WebSocket is a post-demo architecture item.

### 6. History is not searchable 🟢

**Demo impact: Low** — list + reopen already works. **Effort: Low–Med.**

PRD expectation:
- Every report should be saved to a searchable history (`docs/PRD.md:7`).

Current implementation:
- The history page lists reports in descending creation order and links to each report (`app/history/page.tsx:7-37`).
- There is no search input, query handling, repository search method, or API filter.

Impact:
- Reports are persisted and reopenable, but not searchable.

**Recommendation: After demo.** With a handful of demo reports, browsing the list is enough. Search matters once history grows.

### 9. Deployment scale path is only partial 🟢

**Demo impact: None** — explicitly acceptable for a local demo. **Effort: Med.**

PRD expectation:
- Storage abstraction should support local dir to S3-compatible deploy path (`docs/PRD.md:151`, `docs/PRD.md:159`).
- SQLite local dev should be able to point the same Prisma schema at Postgres for deployment (`docs/PRD.md:160`).

Current implementation:
- The app storage implementation is local-only (`lib/domain/pipeline/deps.ts:9-15`, `lib/adapters/storage/local-storage.ts:4-21`).
- `prisma/schema.prisma` fixes the datasource provider to SQLite (`prisma/schema.prisma:5-7`), so Postgres would require a schema/provider change rather than just changing `DATABASE_URL`.

Impact:
- This is acceptable for a local demo, but it does not meet the scale-path wording in the PRD.

**Recommendation: After demo.** Pure deployment/scale concern with no bearing on a local demo run.

---

## Verification results

### Original pass (2026-05-25)

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with two warnings for unused `_contentType` parameters in storage adapters.
- `npm test`: failed. Ten test files passed, but `lib/adapters/repository/prisma-report-repository.test.ts` fails during setup because `npx prisma db push --url "file:./test-repo.db"` exits with `Schema engine error:` before creating `prisma`, which then causes `afterAll` to read `$disconnect` from `undefined`. Running `npx prisma validate` and `npx prisma db push` without `--url` both passed.

### After high-priority fixes (2026-05-26)

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed (same two pre-existing `_contentType` warnings; no new issues).
- `npm test`: **passed — 12 files, 30 tests.** Added streaming-generator and `section`-event assertions. The prisma repo test passed in this run.

**Demo note:** the Tier 1 items are implemented and covered by the unit/integration suite. A manual dev-server pass (progressive streaming, save-and-reopen, retry-on-failure, env-driven default) is still recommended for visual confirmation.
