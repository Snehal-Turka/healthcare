"use client";

import { useEffect, useRef, useState } from "react";
import {
  describeRecordingError,
  MICROPHONE_PERMISSION_DENIED_MESSAGE,
  requestMicrophoneStream,
  SegmentRecorder,
} from "@/lib/client/recorder";
import { stitchTranscripts } from "@/lib/domain/pipeline/chunking";
import type { ProviderId } from "@/lib/domain/report/schema";

// Just under Sarvam's 30s real-time cap — one transcription call per ~29s of
// audio instead of one every few seconds.
const SEGMENT_MS = 29_000;

export function Recorder({
  providerId,
  onComplete,
  disabled,
}: {
  providerId: ProviderId;
  onComplete: (
    audio: Blob,
    transcript: string,
    mimeType: string,
    reportId: string,
    durationMs: number,
  ) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [microphonePermissionDenied, setMicrophonePermissionDenied] =
    useState(false);
  const recorderRef = useRef<SegmentRecorder | null>(null);
  const segmentsRef = useRef<Blob[]>([]);
  const durationsRef = useRef<number[]>([]);
  const transcriptPartsRef = useRef<string[]>([]);
  const pendingRef = useRef<Promise<void>[]>([]);
  const chunkQueueRef = useRef<Promise<void>>(Promise.resolve());
  const reportIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let status: PermissionStatus | null = null;

    void queryMicrophonePermission().then((permissionStatus) => {
      if (!active || !permissionStatus) return;

      status = permissionStatus;
      const syncPermission = () => {
        const denied = permissionStatus.state === "denied";
        setMicrophonePermissionDenied(denied);
        if (!denied) {
          setError((current) =>
            current === MICROPHONE_PERMISSION_DENIED_MESSAGE ? null : current,
          );
        }
      };

      syncPermission();
      permissionStatus.onchange = syncPermission;
    });

    return () => {
      active = false;
      if (status) status.onchange = null;
    };
  }, []);

  const transcribeSegment = (
    segment: Blob,
    index: number,
    durationMs: number,
  ) => {
    segmentsRef.current[index] = segment;
    durationsRef.current[index] = durationMs;

    const task = chunkQueueRef.current.then(async () => {
      const form = new FormData();
      form.append("chunk", segment, "segment.webm");
      form.append("providerId", providerId);
      form.append("durationMs", String(Math.ceil(durationMs)));
      if (reportIdRef.current) form.append("reportId", reportIdRef.current);

      try {
        const res = await fetch("/api/transcribe/chunk", {
          method: "POST",
          body: form,
        });
        if (!res.ok) return;

        const { text } = (await res.json()) as { text?: string };
        if (!text?.trim()) return;

        transcriptPartsRef.current[index] = text;
        setLiveTranscript(stitchTranscripts(transcriptPartsRef.current));
      } catch {
        // Keep recording even if one segment fails to transcribe.
      }
    });

    chunkQueueRef.current = task.catch(() => undefined);
    pendingRef.current.push(task);
    void task.finally(() => {
      pendingRef.current = pendingRef.current.filter((item) => item !== task);
    });
  };

  const start = async () => {
    if (microphonePermissionDenied) return;

    setError(null);
    setLiveTranscript("");
    segmentsRef.current = [];
    durationsRef.current = [];
    transcriptPartsRef.current = [];
    pendingRef.current = [];
    chunkQueueRef.current = Promise.resolve();
    reportIdRef.current = null;

    let stream: MediaStream | null = null;

    try {
      stream = await requestMicrophoneStream();
      const sessionRes = await fetch("/api/reports/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      if (!sessionRes.ok) throw new Error("Could not start report session");
      const session = (await sessionRes.json()) as { reportId?: string };
      if (!session.reportId) throw new Error("Report session returned no id");
      reportIdRef.current = session.reportId;

      const recorder = new SegmentRecorder({
        segmentMs: SEGMENT_MS,
        onSegment: transcribeSegment,
      });
      recorderRef.current = recorder;
      await recorder.start(stream);
      setRecording(true);
    } catch (err) {
      const failure = describeRecordingError(err);
      setError(failure.message);
      if (failure.kind === "permission-denied") {
        const permissionStatus = await queryMicrophonePermission();
        if (!permissionStatus || permissionStatus.state === "denied") {
          setMicrophonePermissionDenied(true);
        }
      }
      stream?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    setError(null);
    await recorder.stop();
    setRecording(false);
    recorderRef.current = null;

    await Promise.allSettled(pendingRef.current);
    const transcript = stitchTranscripts(transcriptPartsRef.current);
    if (!transcript.trim()) {
      setError("Could not transcribe the recording. Please try again.");
      return;
    }

    const audio = new Blob(segmentsRef.current.filter(Boolean), {
      type: recorder.mimeType,
    });
    const durationMs = durationsRef.current.reduce((sum, ms) => sum + ms, 0);
    if (!reportIdRef.current) {
      setError("Report session was lost. Please try again.");
      return;
    }
    onComplete(
      audio,
      transcript,
      recorder.mimeType,
      reportIdRef.current,
      durationMs,
    );
  };

  const recordDisabled = disabled || microphonePermissionDenied;
  const visibleError = microphonePermissionDenied
    ? MICROPHONE_PERMISSION_DENIED_MESSAGE
    : error;

  return (
    <div className="capture-zone-body">
      <div className="recording-row">
        {!recording ? (
          <button
            type="button"
            onClick={start}
            disabled={recordDisabled}
            className="button-danger"
            aria-describedby={visibleError ? "recording-error" : undefined}
            title={
              microphonePermissionDenied
                ? MICROPHONE_PERMISSION_DENIED_MESSAGE
                : undefined
            }
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="8" />
            </svg>
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="button-primary"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop &amp; generate report
          </button>
        )}
        {recording && (
          <span className="live-indicator" aria-live="polite">
            Recording
          </span>
        )}
      </div>

      {liveTranscript && (
        <div className="live-transcript" style={{ marginTop: 14 }}>
          <p className="meta-label">Live transcript</p>
          <p>{liveTranscript}</p>
        </div>
      )}

      {visibleError && (
        <p className="error-note" id="recording-error" style={{ marginTop: 10 }}>
          {visibleError}
        </p>
      )}
    </div>
  );
}

async function queryMicrophonePermission(): Promise<PermissionStatus | null> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return null;
  }

  try {
    return await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
  } catch {
    return null;
  }
}
