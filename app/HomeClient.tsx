"use client";
import { useState } from "react";
import type { ProviderId } from "@/lib/domain/report/schema";
import { useReportStream } from "@/components/report/useReportStream";
import { UploadPanel } from "@/components/capture/UploadPanel";
import { Recorder } from "@/components/capture/Recorder";
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
        <a href="/history" className="clinical-action">
          History
        </a>
      </header>

      <Disclaimer />
      <UploadPanel
        onSubmit={onSubmit}
        busy={busy}
        providerId={providerId}
        onProviderChange={setProviderId}
      />
      <div className="clinical-panel">
        <div className="clinical-panel-header">
          <h2 className="clinical-panel-title">Record live</h2>
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
