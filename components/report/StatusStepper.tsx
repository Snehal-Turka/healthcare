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
  if (stage === "idle" || stage === "error") return null;
  const current = ORDER.indexOf(stage === "finalizing" ? "generating" : stage);
  return (
    <ol className="clinical-progress" aria-label="Report processing status">
      {STEPS.map((s) => {
        const stepIndex = ORDER.indexOf(s.key);
        const reached = stepIndex <= current;
        const currentStep = stepIndex === current;
        return (
          <li
            key={s.key}
            className={`${reached ? "reached" : ""} ${currentStep ? "current" : ""}`.trim()}
            aria-current={currentStep ? "step" : undefined}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
