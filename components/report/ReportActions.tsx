"use client";
import { useState } from "react";
import type { ReportContent } from "@/lib/domain/report/schema";
import { reportToPlainText } from "@/lib/report-text";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ReportActions({
  reportId,
  content,
  freeVisitDeadline,
  medicineExpiryDate,
}: {
  reportId: string;
  content: ReportContent;
  freeVisitDeadline: string | null;
  medicineExpiryDate: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const copy = async () => {
    await navigator.clipboard.writeText(
      reportToPlainText(content, { freeVisitDeadline, medicineExpiryDate }),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const save = async () => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2500);
    }
  };

  const saveLabel = {
    idle: "Save changes",
    saving: "Saving…",
    saved: "✓ Saved",
    error: "Save failed",
  }[saveState];

  return (
    <div className="report-toolbar print:hidden">
      <button
        type="button"
        onClick={save}
        disabled={saveState === "saving"}
        className="button-primary"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        {saveLabel}
      </button>
      <button type="button" onClick={copy} className="button-secondary">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {copied ? "Copied!" : "Copy report"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="button-secondary"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print / PDF
      </button>
    </div>
  );
}
