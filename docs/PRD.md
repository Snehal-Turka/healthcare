# PRD — AI Consultation Scribe (working title: _Manas_)

> **Status:** MVP / demo • **Market:** India • **Primary user:** Psychiatrists (works for all doctors) • **Date:** 2026-05-25

## 1. Summary

A web app that turns a recorded or uploaded doctor–patient consultation — spoken in any Indian language — into a clean, **structured English clinical report**, **fast**. The doctor reviews and edits the draft, then copies it or exports a prescription-style PDF. Every report is saved to a searchable history. Psychiatry is the focus, so the report surfaces **risk/safety flags** and is built around how a mental-health consult actually flows.

Two things define the product: the **language+structure bridge** (messy multilingual conversation in → tidy English clinical note out) and **speed** (the wait between "done talking" and "report on screen" must feel near-instant).

## 2. Problem & Value

Indian psychiatrists spend significant time writing notes and prescriptions after each consult, often translating in their head from Hindi/regional speech to English records. Follow-up adherence is also weak — patients don't return until they're in crisis.

**Value to the doctor:**

1. **Time back** — no manual note-taking; structured draft in seconds, not minutes.
2. **Language bridge** — speak/listen in any Indian language, get an English clinical record automatically.
3. **Safety net** — risk/safety cues (self-harm, suicidal ideation, crisis language) are flagged for attention.
4. **Patient retention engine** — the report auto-computes a **3-day free-visit deadline** and a **2-month medicine-expiry mandatory-revisit** notice. These are built-in reasons for the patient to come back — direct business value.
5. **Trust by design** — every section is an editable _draft_ with a clear "doctor must review before clinical use" disclaimer.

## 3. Goals & Non-Goals

**Goals (MVP)**

- Record in-browser or upload an audio file (audio only).
- Transcribe via a provider that is **swappable at runtime** (OpenAI / Sarvam / Amazon Transcribe).
- Generate a structured **English** report via OpenAI from the transcript.
- **Be fast** — meet the latency budget in §4 for both recorded and uploaded audio.
- Let the doctor edit every field, copy the report, and export a **PDF/print** prescription-style document.
- Persist reports to a history (no login), viewable and re-openable.
- Show **live processing status** and **stream the report** as it is produced.

**Non-Goals (explicitly out of scope for this MVP)**

- User accounts / authentication / multi-tenant.
- Side-by-side provider A/B comparison UI (audio is stored so this can be added later).
- WhatsApp / patient-facing sharing.
- Mental Status Exam draft, provisional diagnoses, ICD/DSM coding.
- Report in languages other than English; patient-language report variant.
- EHR/EMR integration, billing, payments, appointment booking.
- Mobile app (responsive web is enough).

## 4. Performance — A First-Class Requirement

Speed is a product feature, not an afterthought. The perceived wait between the doctor finishing the audio and a usable report appearing must be minimal.

**Latency budget (targets, typical consult):**

- **Recorded audio:** transcript ~ready at the moment recording stops (because it streamed during capture). First report section visible **< 2 s** after stop; full report streamed **< ~10 s**.
- **Uploaded audio:** transcription wall-clock ≈ _length of the longest parallel chunk + merge_, not the full file duration. Report streaming begins as soon as the transcript is ready.
- Every stage is **timed and surfaced** (upload / transcribe / generate ms) so we can measure against this budget and catch regressions.

**How we hit it:**

1. **Stream while recording (the big one).** Audio chunks are transcribed _during_ the consult (see §7), so there is little to no transcription wait after stop.
2. **Parallel-chunk uploads.** Split an uploaded file on silence/VAD (with small overlaps) and transcribe chunks **concurrently**, then stitch — turning a long serial transcription into roughly the time of one chunk.
3. **Stream the report.** OpenAI output streams into the UI so sections fill in progressively; the doctor reads/edits the top while the rest arrives. Perceived latency collapses.
4. **Direct, compact uploads.** Record/encode to **Opus (16 kHz mono)** to cut bytes; upload **directly to storage via presigned URL** so the app server is never a transfer bottleneck and processing can start immediately.
5. **Pipeline, don't serialize.** Transcription and report generation overlap where possible (e.g., begin map-style summarization of early chunks while later chunks transcribe).
6. **Prompt caching + region.** Cache the static system prompt for the report step; run compute and pick provider regions close to India (e.g., Mumbai) to cut network RTT.

## 5. Core User Flow

1. Doctor lands on the **homepage**: a single, prominent capture area — **Record** or **Upload audio** — plus a **transcription-provider dropdown** (defaults to env config).
2. **Record:** audio streams to the chosen provider in chunks as the consult happens; a live partial transcript / progress is visible. **Upload:** the file goes straight to storage and parallel-chunk transcription begins.
3. On stop / upload-complete, the report **streams in** under the live status (`Transcribing (<provider>) → Generating → Ready`).
4. The **structured report** renders, fully editable (see §6). Risk/safety flags, if any, are pinned at the top.
5. Doctor edits as needed, then **Copies** the report and/or exports a **PDF / prints** it.
6. The report is **saved to history** automatically; the doctor can reopen, edit, or re-export any past report.

## 6. The Report (key feature design)

The report is a structured object rendered as an editable form. Sections:

| Section                                 | Source           | Behaviour                                                                                                                                                                                |
| --------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Risk / Safety Flags**                 | AI               | Non-diagnostic alerts for self-harm / suicidal ideation / crisis cues. Pinned at top, visually distinct. Empty state: "No safety concerns detected — clinician judgment still required." |
| **Summary**                             | AI               | Editable **bulleted list** of consultation highlights. Doctor can add/remove/reorder items.                                                                                              |
| **Medication Schedule**                 | AI               | Editable **table**: _Medicine • Dose • Timing (Morning / Afternoon / Night / Custom) • Duration_. One row per drug. Add/edit/delete rows. Prints like a prescription.                    |
| **Next Meeting Agenda & Time**          | AI               | _Conditional_ — shown only if a follow-up is implied. Agenda notes + suggested date/time, both editable.                                                                                 |
| **Free-Visit Deadline**                 | Computed (no AI) | `report.generatedAt + 3 days`. Static notice: revisit free if before this date.                                                                                                          |
| **Medicine Expiry & Mandatory Revisit** | Computed (no AI) | `report.generatedAt + 2 months`. Notice that medication course ends and an in-person revisit is required.                                                                                |

**Every section is a draft.** A persistent disclaimer states the report is AI-generated and must be reviewed/edited by the doctor before any clinical use or sharing.

## 7. Recording & Chunking Strategy

The recording path is designed to **transcribe during capture** so there is no transcription wait at stop.

- **Capture:** the browser **MediaRecorder API** emits chunks on a `timeslice` (≈3–5 s). Each chunk is sent to the active provider as it arrives.
- **Two transcription modes behind one interface:**
  - **Streaming** — when the provider supports realtime (e.g., Amazon Transcribe Streaming, OpenAI realtime): chunks stream over a WebSocket and partial transcripts return live.
  - **Chunked-batch fallback** — when a provider is batch-only: chunks are transcribed in a rolling window / concurrently and stitched. Same outcome, different mechanics.
- **Boundary handling:** split on silence (VAD) or use small overlaps between chunks to avoid cutting words; de-duplicate overlap on stitch.
- **Provider capability flag:** each provider declares `supportsStreaming`; the pipeline picks streaming vs chunked-batch automatically. The doctor never sees this — it just gets faster when the provider allows.
- **Uploads** reuse the chunked-batch path (parallel chunks) since live streaming isn't possible for a finished file.
- _Feasibility note:_ streaming is provider-dependent and the most complex piece. The architecture treats it as an **optimization layer** — if a provider can't stream, the chunked-batch fallback still delivers the latency wins for uploads and most of them for recording.

## 8. Transcription Provider Abstraction

A single interface, three implementations, selectable at runtime:

```ts
interface TranscriptionProvider {
  id: "openai" | "sarvam" | "amazon";
  supportsStreaming: boolean;
  transcribeBatch(
    audioChunk,
    opts,
  ): Promise<{ text: string; language?: string }>;
  transcribeStream?(
    audioStream,
    opts,
  ): AsyncIterable<{ partial: string; isFinal: boolean }>;
}
```

- A **provider registry** maps id → implementation. Default comes from an env var; the homepage dropdown overrides per run. The chosen provider id is stored on the report.
- Each implementation hides its own mechanics behind the interface:
  - **OpenAI** — file/chunk → transcription API; realtime where available.
  - **Sarvam AI** — Indian-language STT; strong on regional + code-switching.
  - **Amazon Transcribe** — supports **streaming** (WebSocket) and **batch** (audio in S3 + job polling, needs AWS creds). Heaviest to wire up; its streaming mode is a strong fit for the recording path.
- Adding a 4th provider later = implement the interface + register it. No UI/pipeline changes.

## 9. Report Generation (OpenAI)

- Input: the transcript (any language) + a structured prompt instructing **English** output and the exact section schema from §6.
- Output: **streamed structured JSON** matching the report schema (summary items, medication rows, optional next-meeting, risk flags). The UI renders sections as they arrive. Computed sections (§6 rows 5–6) are added by the app, not the model.
- The generator sits **behind its own interface** (mirroring STT) so the model/prompt can be swapped for experiments without touching the pipeline.

## 10. Processing Model & Pipeline

- The pipeline is an explicit, staged flow: `ingest → transcribe → generate → finalize`, each stage with typed input/output and **timing instrumentation**.
- `POST /api/reports` creates a report record (`status = processing`) and drives the pipeline; status advances per stage. Report content **streams** to the client (streaming response / SSE), with `GET /api/reports/:id` for polling and reopening.
- The pipeline runs in-request for the MVP but is written as a **self-contained orchestrator with a job-shaped interface**, so it can be lifted into a background worker/queue later **without changing callers** (scale path).
- Failures set `status = failed` with a user-visible message and a retry; stage timings are recorded even on failure.

## 11. Architecture & Engineering Principles

Built the way a senior engineer would: **modular, clean, efficient, and ready to scale.**

- **Layered, dependency-inverted:**
  - **Core/domain** (no framework, no SDKs): report schema, pipeline orchestration, business rules (deadline math). Pure and unit-testable.
  - **Adapters** (behind interfaces): `TranscriptionProvider`s, `ReportGenerator`, `Storage`, `Repository` (DB). Each isolated, swappable, independently testable with fakes.
  - **Transport** (Next.js route handlers): thin — validate input, delegate to core, stream output.
  - **UI** (React): presentational components + hooks for streaming status/report. No business logic.
- **Single responsibility & small files.** Each module answers: what it does, how to use it, what it depends on. Large files are a smell to split.
- **Configuration & secrets:** one typed config module; all provider keys in env, never client-side.
- **Scale path designed-in, not built:** stateless handlers; storage abstraction (local dir → S3); DB abstraction (SQLite → Postgres via same Prisma schema); pipeline extractable to a queue/worker. None of this adds MVP work — it's about _where the seams are_.
- **Observability:** per-stage timing + structured logs so the §4 latency budget is measurable from day one.
- **Resilience:** typed error handling and retries at adapter boundaries; provider failure never crashes the request.
- **Testing:** unit tests for core + adapters (via fakes); the swappable interfaces make this cheap.

## 12. Data Model (Prisma + SQLite)

- **Report**: `id`, `createdAt`, `generatedAt`, `status` (processing | ready | failed), `providerId`, `audioRef`, `detectedLanguage`, `transcript`, `report` (JSON: summary, medications, nextMeeting, riskFlags), `freeVisitDeadline`, `medicineExpiryDate`, `stageTimings` (ingest/transcribe/generate ms).
- Audio files stored via a small **storage abstraction** (local data dir for dev; S3-compatible for deploy). Audio is retained to enable future re-transcription / A/B comparison.
- SQLite for local dev; same Prisma schema points at Postgres for deployment.

## 13. Tech Stack

- **Next.js 16 (App Router) + React 19 + Tailwind v4** (existing scaffold).
- **Prisma + SQLite** (→ Postgres for deploy).
- **OpenAI SDK** (streamed report generation; also OpenAI STT provider).
- **Sarvam AI** + **AWS Transcribe** SDKs for the other STT providers.
- In-browser recording via **MediaRecorder API** (Opus/16 kHz mono), chunked uploads, **presigned direct-to-storage** upload.
- Streaming to UI via streaming responses / SSE.
- PDF via a print-stylesheet `@media print` route and/or a lightweight client PDF export.

> Per `AGENTS.md`: this Next.js version has breaking changes — read the relevant guides in `node_modules/next/dist/docs/` before writing routing/data-fetching/streaming code during implementation.

## 14. Privacy, Safety & Compliance (India)

- Health data is sensitive personal data under India's **DPDP Act, 2023**. MVP/demo uses clearly-labelled demo data and an on-screen **consent + disclaimer**; production needs explicit patient consent, retention limits, and access controls (tracked, not built in MVP).
- Risk/safety flags are **alerts, not diagnoses**; the disclaimer makes clinician responsibility explicit.
- API keys for all providers live in env vars, never in the client.

## 15. Success Criteria / Demo Script

A successful demo: open the homepage → record a short Hindi/English consult → watch the partial transcript build live → on stop, the **English** report **streams in within a couple of seconds** → a risk flag is correctly surfaced → doctor edits a medicine row → exports a clean PDF → the report shows up in history on refresh. Repeat with an **uploaded** file and confirm parallel-chunk transcription keeps it fast.

**MVP is done when:** the flow works end-to-end with at least one provider fully wired (including its fast path), the other two selectable, reports persist across restarts, and stage timings meet the §4 budget on a representative clip.

## 16. Open Questions / Assumptions

- Working product name (_Manas_ is a placeholder).
- Default transcription provider for the demo (assumption: OpenAI for the smoothest path; Amazon for the streaming-recording showcase).
- Deployment target (assumption: local-first; Postgres + S3 + Mumbai region when hosted).
- Acceptable max audio length / file size, and chunk size / overlap defaults (to be tuned against the latency budget).
