"use client";
import { useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="capture-zone-body">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
          if (file.size > MAX_SIZE) {
            setError("File size exceeds 10 MB limit.");
            if (inputRef.current) {
              inputRef.current.value = "";
            }
          } else {
            setError(null);
            onSubmit(file, providerId);
          }
        }}
        className="clinical-file-input"
        style={
          error
            ? {
                borderColor: "var(--danger-border)",
                background: "var(--danger-soft)",
              }
            : undefined
        }
      />
      <p className="capture-zone-hint">
        Supported formats: MP3, WAV, M4A, WebM, OGG (Max 10 MB)
      </p>
      {error && (
        <p className="error-note" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}
