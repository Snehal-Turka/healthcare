"use client";

import { useCallback, useRef, useState } from "react";
import type { ReportRecord } from "@/lib/adapters/repository/report-repository";
import type { PipelineEvent } from "@/lib/domain/pipeline/orchestrator";
import type { ProviderId, ReportContent } from "@/lib/domain/report/schema";

export type Stage =
  | "idle"
  | "ingesting"
  | "transcribing"
  | "generating"
  | "finalizing"
  | "ready"
  | "error";

type SubmitArgs = [
  audio: Blob,
  providerId: ProviderId,
  filename?: string,
  transcript?: string,
];

export function useReportStream() {
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [partial, setPartial] = useState<Partial<ReportContent>>({});
  const [error, setError] = useState<string | null>(null);
  const lastArgs = useRef<SubmitArgs | null>(null);

  const submit = useCallback(
    async (
      audio: Blob,
      providerId: ProviderId,
      filename = "consult.webm",
      transcript?: string,
    ) => {
      lastArgs.current = [audio, providerId, filename, transcript];
      setStage("ingesting");
      setTranscript("");
      setReport(null);
      setPartial({});
      setError(null);

      const form = new FormData();
      form.append("audio", audio, filename);
      form.append("providerId", providerId);
      if (transcript) form.append("transcript", transcript);

      const res = await fetch("/api/reports", { method: "POST", body: form });
      if (!res.ok || !res.body) {
        setError(`Request failed (${res.status})`);
        setStage("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line) as PipelineEvent);
        }
      }

      function handleEvent(e: PipelineEvent) {
        if (e.type === "status") setStage(e.stage);
        else if (e.type === "transcript") setTranscript(e.text);
        else if (e.type === "section")
          setPartial((prev) => ({ ...prev, [e.payload.section]: e.payload.data }));
        else if (e.type === "report") {
          setReport(e.report);
          setStage("ready");
        } else if (e.type === "error") {
          setError(e.message);
          setStage("error");
        }
      }
    },
    [],
  );

  const retry = useCallback(() => {
    if (lastArgs.current) void submit(...lastArgs.current);
  }, [submit]);

  return { stage, transcript, report, partial, error, submit, retry };
}
