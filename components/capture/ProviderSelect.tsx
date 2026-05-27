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
    <label className="provider-field">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: 0.6 }}
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
      <span>Transcription</span>
      <select
        className="clinical-select"
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
