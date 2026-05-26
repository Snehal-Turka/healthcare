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
