"use client";
import { useRef } from "react";
import type { ProviderId } from "@/lib/domain/report/schema";
import { ProviderSelect } from "./ProviderSelect";

export function UploadPanel({
  onSubmit,
  busy,
  providerId,
  onProviderChange,
}: {
  onSubmit: (file: File, providerId: ProviderId) => void;
  busy: boolean;
  providerId: ProviderId;
  onProviderChange: (providerId: ProviderId) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="clinical-panel">
      <div className="clinical-panel-header">
        <h2 className="clinical-panel-title">New consultation</h2>
        <ProviderSelect
          value={providerId}
          onChange={onProviderChange}
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
          if (file) onSubmit(file, providerId);
        }}
        className="clinical-file-input"
      />
      <p className="clinical-panel-note">
        Upload an audio recording of the consultation, or record live below.
      </p>
    </div>
  );
}
