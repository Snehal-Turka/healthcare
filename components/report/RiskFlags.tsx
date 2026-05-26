"use client";
import type { RiskFlag } from "@/lib/domain/report/schema";

export function RiskFlags({ flags }: { flags: RiskFlag[] }) {
  if (!flags.length) {
    return (
      <p className="risk-empty">
        No safety concerns detected — clinician judgment still required.
      </p>
    );
  }
  return (
    <ul className="risk-list">
      {flags.map((f, i) => (
        <li key={i} className="risk-card">
          <span className="risk-category">{f.category}</span>
          <p className="risk-quote">&ldquo;{f.quote}&rdquo;</p>
          <p className="risk-note">{f.note}</p>
        </li>
      ))}
    </ul>
  );
}
