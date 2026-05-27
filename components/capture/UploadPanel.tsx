"use client";
import { useRef } from "react";
import type { ProviderId } from "@/lib/domain/report/schema";

export function UploadPanel({
  onSubmit,
  busy,
  providerId,
}: {
  onSubmit: (file: File, providerId: ProviderId) => void;
  busy: boolean;
  providerId: ProviderId;
  onProviderChange: (providerId: ProviderId) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="capture-zone-body">
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
      <p className="capture-zone-hint">
        Supported formats: MP3, WAV, M4A, WebM, OGG
      </p>
    </div>
  );
}
