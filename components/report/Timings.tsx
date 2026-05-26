import type { StageTimings } from "@/lib/domain/report/schema";

export function Timings({ timings }: { timings: StageTimings }) {
  const total =
    (timings.ingestMs ?? 0) +
    (timings.transcribeMs ?? 0) +
    (timings.generateMs ?? 0);

  const formatSeconds = (ms?: number) => {
    return `${((ms ?? 0) / 1000).toFixed(2)}s`;
  };

  const getPercentage = (ms?: number) => {
    if (total === 0) return "0%";
    const pct = ((ms ?? 0) / total) * 100;
    return pct % 1 === 0 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
  };

  const cell = (label: string, ms?: number) => (
    <span className="timing-chip">
      {label}: {formatSeconds(ms)} ({getPercentage(ms)})
    </span>
  );

  return (
    <div className="timing-strip print:hidden">
      {cell("Ingest", timings.ingestMs)}
      {cell("Transcribe", timings.transcribeMs)}
      {cell("Generate", timings.generateMs)}
      <span className="timing-chip timing-chip-total">
        Total: {formatSeconds(total)}
      </span>
    </div>
  );
}
