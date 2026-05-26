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
    saved: "Saved",
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
        {saveLabel}
      </button>
      <button type="button" onClick={copy} className="button-secondary">
        {copied ? "Copied!" : "Copy report"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="button-secondary"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
