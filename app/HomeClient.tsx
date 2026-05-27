"use client";
import { useState } from "react";
import type { ProviderId } from "@/lib/domain/report/schema";
import { useReportStream } from "@/components/report/useReportStream";
import { UploadPanel } from "@/components/capture/UploadPanel";
import { Recorder } from "@/components/capture/Recorder";
import { ProviderSelect } from "@/components/capture/ProviderSelect";
import { StatusStepper } from "@/components/report/StatusStepper";
import { ReportView } from "@/components/report/ReportView";
import { StreamingReportView } from "@/components/report/StreamingReportView";
import { Disclaimer } from "@/components/Disclaimer";

export default function HomeClient({
  defaultProvider,
}: {
  defaultProvider: ProviderId;
}) {
  const { stage, transcript, report, partial, error, submit, retry } =
    useReportStream();
  const [providerId, setProviderId] = useState<ProviderId>(defaultProvider);
  const busy = stage !== "idle" && stage !== "ready" && stage !== "error";
  const streaming =
    !report &&
    (stage === "generating" ||
      stage === "finalizing" ||
      Object.keys(partial).length > 0);

  const onSubmit = async (file: File, providerId: ProviderId) =>
    submit(file, providerId, file.name, undefined, undefined, await durationSeconds(file));

  return (
    <main className="clinical-shell clinical-flow">
      <header className="clinical-topbar">
        <div>
          <p className="clinical-kicker">Clinical documentation</p>
          <h1 className="clinical-title">Manas Consultation Scribe</h1>
        </div>
        <div className="topbar-actions">
          <ProviderSelect
            value={providerId}
            onChange={setProviderId}
            disabled={busy}
          />
          <a href="/history" className="clinical-action">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            History
          </a>
        </div>
      </header>

      <Disclaimer />

      <section className="capture-panel">
        <div className="capture-zone">
          <div className="capture-zone-header">
            <div className="capture-zone-icon capture-zone-icon--upload">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <h2 className="capture-zone-title">Upload recording</h2>
              <p className="capture-zone-desc">Upload an audio file from a previous session</p>
            </div>
          </div>
          <UploadPanel
            onSubmit={onSubmit}
            busy={busy}
            providerId={providerId}
            onProviderChange={setProviderId}
          />
        </div>

        <div className="capture-divider" />

        <div className="capture-zone">
          <div className="capture-zone-header">
            <div className="capture-zone-icon capture-zone-icon--mic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <div>
              <h2 className="capture-zone-title">Record live</h2>
              <p className="capture-zone-desc">Capture from your microphone during a consultation</p>
            </div>
          </div>
          <Recorder
            providerId={providerId}
            disabled={busy}
            onComplete={(audio, liveTranscript, mimeType, reportId, durationMs) =>
              submit(
                audio,
                providerId,
                `consult.${mimeType.includes("webm") ? "webm" : "audio"}`,
                liveTranscript,
                reportId,
                durationMs / 1000,
              )
            }
          />
        </div>
      </section>

      <StatusStepper stage={stage} />

      {error && (
        <div className="error-note">
          <p style={{ margin: 0 }}>{error}</p>
          <button
            type="button"
            onClick={retry}
            className="button-secondary"
            style={{ marginTop: 10 }}
          >
            Retry
          </button>
        </div>
      )}

      {transcript && stage !== "ready" && (
        <div className="transcript-card">
          <p className="meta-label">Transcript</p>
          <p>{transcript}</p>
        </div>
      )}

      {streaming && <StreamingReportView partial={partial} />}
      {report && <ReportView report={report} />}
    </main>
  );
}

async function durationSeconds(file: File): Promise<number | undefined> {
  const url = URL.createObjectURL(file);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("Could not read audio duration"));
    });
    return Number.isFinite(audio.duration) ? audio.duration : undefined;
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}
