# Phase 4 — Frontend: Capture, Streaming Report, Edit, Export, History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A demoable UI for the **upload** path: choose a provider and upload audio → live status + transcript → a fully editable English report (risk flags, summary, medication table, next meeting, computed deadlines) → copy + print/PDF → saved history that can be reopened.

**Architecture:** A client hook (`useReportStream`) POSTs the audio and consumes the NDJSON stream from Phase 3 into React state. Presentational components render and edit a local copy of `ReportContent` (controlled inputs); no business logic lives in the UI. History/reopen pages are Server Components that read through the repository. A pure `reportToPlainText` helper backs copy-to-clipboard and is unit-tested. Print uses a `@media print` stylesheet.

**Tech Stack:** React 19 (Client + Server Components), Tailwind v4, Vitest. Depends on Phase 3.

---

## File structure introduced in this phase

```
lib/report-text.ts                       # pure: ReportContent -> plain text (copy/export)
components/report/useReportStream.ts      # client hook consuming the NDJSON stream
components/capture/ProviderSelect.tsx
components/capture/UploadPanel.tsx
components/report/StatusStepper.tsx
components/report/RiskFlags.tsx
components/report/SummaryList.tsx
components/report/MedicationTable.tsx
components/report/NextMeeting.tsx
components/report/Deadlines.tsx
components/report/ReportActions.tsx
components/report/ReportView.tsx          # composes the editable sections
components/Disclaimer.tsx
app/page.tsx                              # home: capture + live report
app/history/page.tsx                      # list (Server Component)
app/report/[id]/page.tsx                  # reopen (Server Component)
```

---

### Task 1: Plain-text serializer (copy/export source of truth)

**Files:**

- Create: `lib/report-text.ts`
- Test: `lib/report-text.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// lib/report-text.test.ts
import { describe, it, expect } from "vitest";
import { reportToPlainText } from "@/lib/report-text";

describe("reportToPlainText", () => {
  it("renders sections, a medication line, and deadlines", () => {
    const text = reportToPlainText(
      {
        riskFlags: [
          { category: "suicidal-ideation", quote: "no point", note: "assess" },
        ],
        summary: ["Low mood for 3 weeks"],
        medications: [
          {
            medicine: "Sertraline",
            dose: "50mg",
            timing: { morning: true, afternoon: false, night: true },
            duration: "4 weeks",
          },
        ],
        nextMeeting: { agenda: "Review", suggestedAt: null },
      },
      {
        freeVisitDeadline: "2026-05-28T09:00:00.000Z",
        medicineExpiryDate: "2026-07-25T09:00:00.000Z",
      },
    );
    expect(text).toContain("SUMMARY");
    expect(text).toContain("Sertraline 50mg");
    expect(text).toContain("Morning, Night");
    expect(text).toContain("RISK / SAFETY FLAGS");
    expect(text).toContain("Free-visit deadline");
  });
});
```

- [x] **Step 2: Run it to confirm it fails** — Run: `yarn vitest run lib/report-text.test.ts` → FAIL.

- [x] **Step 3: Implement**

```ts
// lib/report-text.ts
import type { ReportContent, Medication } from "@/lib/domain/report/schema";

function timingLabel(t: Medication["timing"]): string {
  const parts = [
    t.morning && "Morning",
    t.afternoon && "Afternoon",
    t.night && "Night",
  ].filter(Boolean) as string[];
  if (t.custom) parts.push(t.custom);
  return parts.length ? parts.join(", ") : "—";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function reportToPlainText(
  content: ReportContent,
  deadlines: {
    freeVisitDeadline: string | null;
    medicineExpiryDate: string | null;
  },
): string {
  const lines: string[] = [];

  if (content.riskFlags.length) {
    lines.push("RISK / SAFETY FLAGS (alerts, not diagnoses)");
    for (const f of content.riskFlags)
      lines.push(`- [${f.category}] "${f.quote}" — ${f.note}`);
    lines.push("");
  }

  lines.push("SUMMARY");
  for (const s of content.summary) lines.push(`- ${s}`);
  lines.push("");

  lines.push("MEDICATION SCHEDULE");
  for (const m of content.medications)
    lines.push(
      `- ${m.medicine} ${m.dose} — ${timingLabel(m.timing)} — ${m.duration}`,
    );
  if (!content.medications.length) lines.push("- (none)");
  lines.push("");

  if (content.nextMeeting) {
    lines.push("NEXT MEETING");
    lines.push(
      `- ${content.nextMeeting.agenda}${content.nextMeeting.suggestedAt ? ` (${fmtDate(content.nextMeeting.suggestedAt)})` : ""}`,
    );
    lines.push("");
  }

  lines.push(`Free-visit deadline: ${fmtDate(deadlines.freeVisitDeadline)}`);
  lines.push(
    `Medicine expiry / mandatory revisit: ${fmtDate(deadlines.medicineExpiryDate)}`,
  );

  return lines.join("\n");
}
```

- [x] **Step 4: Run the test to confirm it passes** — Expected: PASS.

---

### Task 2: The streaming hook

**Files:** Create `components/report/useReportStream.ts`

- [x] **Step 1: Implement**

Reads the NDJSON body line-by-line and reduces `PipelineEvent`s into state.

```ts
// components/report/useReportStream.ts
"use client";

import { useCallback, useState } from "react";
import type { ReportRecord } from "@/lib/adapters/repository/report-repository";
import type { PipelineEvent } from "@/lib/domain/pipeline/orchestrator";
import type { ProviderId } from "@/lib/domain/report/schema";

export type Stage =
  | "idle"
  | "ingesting"
  | "transcribing"
  | "generating"
  | "finalizing"
  | "ready"
  | "error";

export function useReportStream() {
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (audio: Blob, providerId: ProviderId, filename = "consult.webm") => {
      setStage("ingesting");
      setTranscript("");
      setReport(null);
      setError(null);

      const form = new FormData();
      form.append("audio", audio, filename);
      form.append("providerId", providerId);

      const res = await fetch("/api/reports", { method: "POST", body: form });
      if (!res.ok || !res.body) {
        setError(`Request failed (${res.status})`);
        setStage("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line) as PipelineEvent);
        }
      }

      function handleEvent(e: PipelineEvent) {
        if (e.type === "status") setStage(e.stage);
        else if (e.type === "transcript") setTranscript(e.text);
        else if (e.type === "report") {
          setReport(e.report);
          setStage("ready");
        } else if (e.type === "error") {
          setError(e.message);
          setStage("error");
        }
      }
    },
    [],
  );

  return { stage, transcript, report, error, submit };
}
```

---

### Task 3: Capture UI (provider select + upload panel)

**Files:**

- Create: `components/capture/ProviderSelect.tsx`
- Create: `components/capture/UploadPanel.tsx`

- [x] **Step 1: ProviderSelect**

```tsx
// components/capture/ProviderSelect.tsx
"use client";
import type { ProviderId } from "@/lib/domain/report/schema";

const OPTIONS: { id: ProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "sarvam", label: "Sarvam AI" },
  { id: "amazon", label: "Amazon Transcribe" },
];

export function ProviderSelect({
  value,
  onChange,
  disabled,
}: {
  value: ProviderId;
  onChange: (v: ProviderId) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">Transcription</span>
      <select
        className="rounded-md border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ProviderId)}
      >
        {OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [x] **Step 2: UploadPanel**

```tsx
// components/capture/UploadPanel.tsx
"use client";
import { useRef, useState } from "react";
import type { ProviderId } from "@/lib/domain/report/schema";
import { ProviderSelect } from "./ProviderSelect";

export function UploadPanel({
  onSubmit,
  busy,
}: {
  onSubmit: (file: File, providerId: ProviderId) => void;
  busy: boolean;
}) {
  const [provider, setProvider] = useState<ProviderId>("openai");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium">New consultation</h2>
        <ProviderSelect
          value={provider}
          onChange={setProvider}
          disabled={busy}
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSubmit(file, provider);
        }}
        className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-white disabled:opacity-50 dark:file:bg-white dark:file:text-black"
      />
      <p className="mt-2 text-xs text-neutral-500">
        Upload an audio recording of the consultation. (Live recording arrives
        in Phase 5.)
      </p>
    </div>
  );
}
```

---

### Task 4: Status stepper + disclaimer

**Files:**

- Create: `components/report/StatusStepper.tsx`
- Create: `components/Disclaimer.tsx`

- [x] **Step 1: StatusStepper**

```tsx
// components/report/StatusStepper.tsx
"use client";
import type { Stage } from "./useReportStream";

const STEPS: { key: Stage; label: string }[] = [
  { key: "ingesting", label: "Uploading" },
  { key: "transcribing", label: "Transcribing" },
  { key: "generating", label: "Generating" },
  { key: "ready", label: "Ready" },
];

const ORDER: Stage[] = [
  "idle",
  "ingesting",
  "transcribing",
  "generating",
  "finalizing",
  "ready",
];

export function StatusStepper({ stage }: { stage: Stage }) {
  if (stage === "idle") return null;
  const current = ORDER.indexOf(stage === "finalizing" ? "generating" : stage);
  return (
    <ol className="my-4 flex gap-2 text-sm">
      {STEPS.map((s) => {
        const reached = ORDER.indexOf(s.key) <= current;
        return (
          <li
            key={s.key}
            className={`rounded-full px-3 py-1 ${reached ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800"}`}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
```

- [x] **Step 2: Disclaimer**

```tsx
// components/Disclaimer.tsx
export function Disclaimer() {
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300">
      AI-generated draft. The doctor must review and edit before any clinical
      use or sharing. Risk/safety flags are alerts, not diagnoses. Patient data
      is sensitive personal data under India&rsquo;s DPDP Act, 2023 — obtain
      consent before recording.
    </p>
  );
}
```

---

### Task 5: Editable report sections

**Files:**

- Create: `components/report/RiskFlags.tsx`
- Create: `components/report/SummaryList.tsx`
- Create: `components/report/MedicationTable.tsx`
- Create: `components/report/NextMeeting.tsx`
- Create: `components/report/Deadlines.tsx`

Each section receives a value and an `onChange`. The parent (`ReportView`, Task 7) owns the editable state.

- [x] **Step 1: RiskFlags (read-only, pinned)**

```tsx
// components/report/RiskFlags.tsx
"use client";
import type { RiskFlag } from "@/lib/domain/report/schema";

export function RiskFlags({ flags }: { flags: RiskFlag[] }) {
  if (!flags.length) {
    return (
      <p className="text-sm text-neutral-500">
        No safety concerns detected — clinician judgment still required.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => (
        <li
          key={i}
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-950/40"
        >
          <span className="font-semibold uppercase text-red-700 dark:text-red-300">
            {f.category}
          </span>
          <p className="italic">“{f.quote}”</p>
          <p className="text-neutral-600 dark:text-neutral-400">{f.note}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [x] **Step 2: SummaryList (add/edit/remove bullets)**

```tsx
// components/report/SummaryList.tsx
"use client";

export function SummaryList({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const update = (i: number, v: string) =>
    onChange(items.map((it, idx) => (idx === i ? v : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, ""]);

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 text-neutral-400">•</span>
          <textarea
            className="min-h-[2.25rem] flex-1 rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
            value={it}
            onChange={(e) => update(i, e.target.value)}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="mt-1 text-xs text-neutral-400 hover:text-red-500"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm text-emerald-600 hover:underline"
      >
        + Add point
      </button>
    </div>
  );
}
```

- [x] **Step 3: MedicationTable (add/edit/remove rows)**

```tsx
// components/report/MedicationTable.tsx
"use client";
import type { Medication } from "@/lib/domain/report/schema";

const EMPTY: Medication = {
  medicine: "",
  dose: "",
  timing: { morning: false, afternoon: false, night: false },
  duration: "",
};

export function MedicationTable({
  rows,
  onChange,
}: {
  rows: Medication[];
  onChange: (next: Medication[]) => void;
}) {
  const set = (i: number, patch: Partial<Medication>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const toggle = (i: number, key: "morning" | "afternoon" | "night") =>
    set(i, { timing: { ...rows[i].timing, [key]: !rows[i].timing[key] } });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
            <th className="py-2 pr-2">Medicine</th>
            <th className="pr-2">Dose</th>
            <th className="pr-2">Morn</th>
            <th className="pr-2">Aft</th>
            <th className="pr-2">Night</th>
            <th className="pr-2">Duration</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-b border-neutral-200 dark:border-neutral-800"
            >
              <td className="py-1 pr-2">
                <input
                  className="w-32 rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700"
                  value={r.medicine}
                  onChange={(e) => set(i, { medicine: e.target.value })}
                />
              </td>
              <td className="pr-2">
                <input
                  className="w-20 rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700"
                  value={r.dose}
                  onChange={(e) => set(i, { dose: e.target.value })}
                />
              </td>
              <td className="pr-2 text-center">
                <input
                  type="checkbox"
                  checked={r.timing.morning}
                  onChange={() => toggle(i, "morning")}
                />
              </td>
              <td className="pr-2 text-center">
                <input
                  type="checkbox"
                  checked={r.timing.afternoon}
                  onChange={() => toggle(i, "afternoon")}
                />
              </td>
              <td className="pr-2 text-center">
                <input
                  type="checkbox"
                  checked={r.timing.night}
                  onChange={() => toggle(i, "night")}
                />
              </td>
              <td className="pr-2">
                <input
                  className="w-24 rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700"
                  value={r.duration}
                  onChange={(e) => set(i, { duration: e.target.value })}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                  className="text-xs text-neutral-400 hover:text-red-500"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => onChange([...rows, { ...EMPTY }])}
        className="mt-2 text-sm text-emerald-600 hover:underline"
      >
        + Add medicine
      </button>
    </div>
  );
}
```

- [x] **Step 4: NextMeeting (optional, toggleable)**

```tsx
// components/report/NextMeeting.tsx
"use client";
import type { NextMeeting as NextMeetingType } from "@/lib/domain/report/schema";

export function NextMeeting({
  value,
  onChange,
}: {
  value: NextMeetingType;
  onChange: (v: NextMeetingType) => void;
}) {
  if (value === null) {
    return (
      <button
        type="button"
        onClick={() => onChange({ agenda: "", suggestedAt: null })}
        className="text-sm text-emerald-600 hover:underline"
      >
        + Add next meeting
      </button>
    );
  }
  const localValue = value.suggestedAt ? value.suggestedAt.slice(0, 16) : "";
  return (
    <div className="space-y-2">
      <textarea
        className="w-full rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
        placeholder="Agenda"
        value={value.agenda}
        onChange={(e) => onChange({ ...value, agenda: e.target.value })}
      />
      <input
        type="datetime-local"
        className="rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
        value={localValue}
        onChange={(e) =>
          onChange({
            ...value,
            suggestedAt: e.target.value
              ? new Date(e.target.value).toISOString()
              : null,
          })
        }
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        className="ml-2 text-xs text-neutral-400 hover:text-red-500"
      >
        Remove
      </button>
    </div>
  );
}
```

- [x] **Step 5: Deadlines (read-only, computed)**

```tsx
// components/report/Deadlines.tsx
function fmt(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}

export function Deadlines({
  freeVisitDeadline,
  medicineExpiryDate,
}: {
  freeVisitDeadline: string | null;
  medicineExpiryDate: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
        <p className="font-medium">Free-visit deadline</p>
        <p>
          Revisit at no charge before <strong>{fmt(freeVisitDeadline)}</strong>.
        </p>
      </div>
      <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/40">
        <p className="font-medium">Medicine expiry &amp; mandatory revisit</p>
        <p>
          Course ends around <strong>{fmt(medicineExpiryDate)}</strong>; an
          in-person revisit is required.
        </p>
      </div>
    </div>
  );
}
```

---

### Task 6: Report actions (copy + print/PDF) and print styles

**Files:**

- Create: `components/report/ReportActions.tsx`
- Modify: `app/globals.css`

- [x] **Step 1: ReportActions**

```tsx
// components/report/ReportActions.tsx
"use client";
import { useState } from "react";
import type { ReportContent } from "@/lib/domain/report/schema";
import { reportToPlainText } from "@/lib/report-text";

export function ReportActions({
  content,
  freeVisitDeadline,
  medicineExpiryDate,
}: {
  content: ReportContent;
  freeVisitDeadline: string | null;
  medicineExpiryDate: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(
      reportToPlainText(content, { freeVisitDeadline, medicineExpiryDate }),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex gap-2 print:hidden">
      <button
        type="button"
        onClick={copy}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
      >
        {copied ? "Copied!" : "Copy report"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
```

- [x] **Step 2: Add print styles** — append to `app/globals.css`

```css
@media print {
  body * {
    visibility: hidden;
  }
  #printable,
  #printable * {
    visibility: visible;
  }
  #printable {
    position: absolute;
    inset: 0;
    padding: 1.5rem;
  }
  .print\:hidden {
    display: none !important;
  }
}
```

---

### Task 7: ReportView — compose editable sections

**Files:** Create `components/report/ReportView.tsx`

- [x] **Step 1: Implement**

Holds the editable copy of `ReportContent` (seeded from the streamed report) and wraps everything in `#printable` for the print stylesheet.

```tsx
// components/report/ReportView.tsx
"use client";
import { useEffect, useState } from "react";
import type { ReportRecord } from "@/lib/adapters/repository/report-repository";
import type { ReportContent } from "@/lib/domain/report/schema";
import { RiskFlags } from "./RiskFlags";
import { SummaryList } from "./SummaryList";
import { MedicationTable } from "./MedicationTable";
import { NextMeeting } from "./NextMeeting";
import { Deadlines } from "./Deadlines";
import { ReportActions } from "./ReportActions";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ReportView({ report }: { report: ReportRecord }) {
  const [content, setContent] = useState<ReportContent>(
    report.content ?? {
      riskFlags: [],
      summary: [],
      medications: [],
      nextMeeting: null,
    },
  );
  useEffect(() => {
    if (report.content) setContent(report.content);
  }, [report.id, report.content]);

  return (
    <div id="printable" className="space-y-6">
      <ReportActions
        content={content}
        freeVisitDeadline={report.freeVisitDeadline}
        medicineExpiryDate={report.medicineExpiryDate}
      />
      <Section title="Risk / Safety Flags">
        <RiskFlags flags={content.riskFlags} />
      </Section>
      <Section title="Summary">
        <SummaryList
          items={content.summary}
          onChange={(summary) => setContent({ ...content, summary })}
        />
      </Section>
      <Section title="Medication Schedule">
        <MedicationTable
          rows={content.medications}
          onChange={(medications) => setContent({ ...content, medications })}
        />
      </Section>
      <Section title="Next Meeting">
        <NextMeeting
          value={content.nextMeeting}
          onChange={(nextMeeting) => setContent({ ...content, nextMeeting })}
        />
      </Section>
      <Deadlines
        freeVisitDeadline={report.freeVisitDeadline}
        medicineExpiryDate={report.medicineExpiryDate}
      />
    </div>
  );
}
```

---

### Task 8: Home page (capture → live → report)

**Files:** Modify `app/page.tsx`

- [x] **Step 1: Replace the scaffold with the capture flow**

```tsx
// app/page.tsx
"use client";
import type { ProviderId } from "@/lib/domain/report/schema";
import { useReportStream } from "@/components/report/useReportStream";
import { UploadPanel } from "@/components/capture/UploadPanel";
import { StatusStepper } from "@/components/report/StatusStepper";
import { ReportView } from "@/components/report/ReportView";
import { Disclaimer } from "@/components/Disclaimer";

export default function Home() {
  const { stage, transcript, report, error, submit } = useReportStream();
  const busy = stage !== "idle" && stage !== "ready" && stage !== "error";

  const onSubmit = (file: File, providerId: ProviderId) =>
    submit(file, providerId, file.name);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manas — Consultation Scribe</h1>
        <a href="/history" className="text-sm text-emerald-600 hover:underline">
          History →
        </a>
      </header>

      <Disclaimer />
      <UploadPanel onSubmit={onSubmit} busy={busy} />
      <StatusStepper stage={stage} />

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {transcript && stage !== "ready" && (
        <div className="rounded-md border border-neutral-200 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <p className="mb-1 font-medium">Transcript</p>
          <p>{transcript}</p>
        </div>
      )}

      {report && <ReportView report={report} />}
    </main>
  );
}
```

- [x] **Step 2: Run the app & verify the upload path**

Run: `yarn dev`, open `http://localhost:3000`, upload a sample clip.
Expected: status steps advance, transcript appears, then the editable report renders. Edit a medication row; click Copy; click Print and verify only the report prints.

---

### Task 9: History list + reopen (Server Components)

**Files:**

- Create: `app/history/page.tsx`
- Create: `app/report/[id]/page.tsx`

- [x] **Step 1: History list**

Reads directly through the repository on the server (no extra fetch).

```tsx
// app/history/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const repo = new PrismaReportRepository(prisma);
  const reports = await repo.list();

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">History</h1>
        <Link href="/" className="text-sm text-emerald-600 hover:underline">
          + New
        </Link>
      </div>
      {reports.length === 0 && (
        <p className="text-sm text-neutral-500">No reports yet.</p>
      )}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {reports.map((r) => (
          <li key={r.id} className="py-3">
            <Link
              href={`/report/${r.id}`}
              className="flex justify-between hover:underline"
            >
              <span>{r.content?.summary[0] ?? `(${r.status})`}</span>
              <span className="text-sm text-neutral-500">
                {new Date(r.createdAt).toLocaleString("en-IN")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [x] **Step 2: Reopen page (Next 16 async params)**

```tsx
// app/report/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";
import { ReportView } from "@/components/report/ReportView";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = new PrismaReportRepository(prisma);
  const report = await repo.get(id);
  if (!report) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link
        href="/history"
        className="text-sm text-emerald-600 hover:underline"
      >
        ← History
      </Link>
      <ReportView report={report} />
    </main>
  );
}
```

- [x] **Step 3: Verify**

Run: `yarn dev`. After generating a report, open `/history` — it lists; click through to `/report/<id>` — it renders the saved report.

---

## Phase verification

- [x] `yarn test` — green (incl. `report-text`).
- [x] `npx tsc --noEmit` — clean.
- [x] `yarn dev` manual run: upload → status steps → transcript → editable report → edit a med row → Copy (clipboard has the plain-text report) → Print shows only the report → `/history` lists it → reopen renders it after a refresh.

## Definition of done

The upload path is fully demoable end-to-end in the browser: provider selectable, streamed status + transcript, an editable English report with all sections and computed deadlines, copy + print/PDF, and a persistent history that reopens saved reports. Ready for the recording fast-path and performance work in Phase 5.
