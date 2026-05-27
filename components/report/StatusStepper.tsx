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

const CheckIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{
      position: "absolute",
      top: "50%",
      left: 13,
      transform: "translateY(-50%)",
    }}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function StatusStepper({ stage }: { stage: Stage }) {
  if (stage === "idle" || stage === "error") return null;
  const current = ORDER.indexOf(stage === "finalizing" ? "generating" : stage);
  return (
    <ol className="clinical-progress" aria-label="Report processing status">
      {STEPS.map((s) => {
        const stepIndex = ORDER.indexOf(s.key);
        const reached = stepIndex <= current;
        const currentStep = stepIndex === current;
        const completed = reached && !currentStep;
        return (
          <li
            key={s.key}
            className={`${reached ? "reached" : ""} ${currentStep ? "current" : ""}`.trim()}
            aria-current={currentStep ? "step" : undefined}
          >
            {completed && <CheckIcon />}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
