"use client";

import { useRef, useState } from "react";
import { SegmentRecorder } from "@/lib/client/recorder";
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
  onComplete: (audio: Blob, transcript: string, mimeType: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<SegmentRecorder | null>(null);
  const segmentsRef = useRef<Blob[]>([]);
  const transcriptPartsRef = useRef<string[]>([]);
  const pendingRef = useRef<Promise<void>[]>([]);

  const transcribeSegment = (segment: Blob, index: number) => {
    segmentsRef.current[index] = segment;

    const task = (async () => {
      const form = new FormData();
      form.append("chunk", segment, "segment.webm");
      form.append("providerId", providerId);

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
    })();

    pendingRef.current.push(task);
    void task.finally(() => {
      pendingRef.current = pendingRef.current.filter((item) => item !== task);
    });
  };

  const start = async () => {
    setError(null);
    setLiveTranscript("");
    segmentsRef.current = [];
    transcriptPartsRef.current = [];
    pendingRef.current = [];

    try {
      const recorder = new SegmentRecorder({
        segmentMs: SEGMENT_MS,
        onSegment: transcribeSegment,
      });
      recorderRef.current = recorder;
      await recorder.start();
      setRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recording failed";
      setError(message);
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
    onComplete(audio, transcript, recorder.mimeType);
  };

  return (
    <div className="clinical-flow">
      <div className="recording-row">
        {!recording ? (
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className="button-danger"
          >
            Record consultation
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="button-primary"
          >
            Stop and generate
          </button>
        )}
        {recording && (
          <span className="live-indicator" aria-live="polite">
            Recording live
          </span>
        )}
      </div>

      {liveTranscript && (
        <div className="live-transcript">
          <p className="meta-label">Live transcript</p>
          <p>{liveTranscript}</p>
        </div>
      )}

      {error && (
        <p className="error-note">{error}</p>
      )}
    </div>
  );
}
