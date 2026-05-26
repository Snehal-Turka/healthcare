"use client";
import type { ReportContent } from "@/lib/domain/report/schema";
import { RiskFlags } from "./RiskFlags";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="report-section">
      <h3 className="report-section-title">{title}</h3>
      {children}
    </section>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="report-skeleton" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="report-skeleton-line"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

const TIMING_LABELS = [
  ["morning", "Morn"],
  ["afternoon", "Aft"],
  ["night", "Night"],
] as const;

/**
 * Read-only view rendered while the report streams in section-by-section.
 * Each section shows its data the moment it arrives; pending sections show a
 * skeleton. Once the run finishes, the page swaps in the editable ReportView.
 */
export function StreamingReportView({
  partial,
}: {
  partial: Partial<ReportContent>;
}) {
  return (
    <div className="report-workspace">
      <Section title="Risk / Safety Flags">
        {partial.riskFlags ? (
          <RiskFlags flags={partial.riskFlags} />
        ) : (
          <Skeleton lines={2} />
        )}
      </Section>

      <Section title="Summary">
        {partial.summary ? (
          partial.summary.length ? (
            <ul className="report-readonly-list">
              {partial.summary.map((item, i) => (
                <li key={i}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="report-readonly-muted">No summary points.</p>
          )
        ) : (
          <Skeleton />
        )}
      </Section>

      <Section title="Medication Schedule">
        {partial.medications ? (
          partial.medications.length ? (
            <div className="medication-table-wrap">
              <table className="medication-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Dose</th>
                    <th>Morn</th>
                    <th>Aft</th>
                    <th>Night</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {partial.medications.map((m, i) => (
                    <tr key={i}>
                      <td>{m.medicine}</td>
                      <td>{m.dose}</td>
                      {TIMING_LABELS.map(([key]) => (
                        <td key={key} className="text-center">
                          {m.timing[key] ? "✓" : "—"}
                        </td>
                      ))}
                      <td>{m.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="report-readonly-muted">No medications discussed.</p>
          )
        ) : (
          <Skeleton lines={2} />
        )}
      </Section>

      <Section title="Next Meeting">
        {partial.nextMeeting !== undefined ? (
          partial.nextMeeting ? (
            <div>
              <p className="report-readonly-text">
                {partial.nextMeeting.agenda}
              </p>
              {partial.nextMeeting.suggestedAt && (
                <p className="report-readonly-muted">
                  {new Date(partial.nextMeeting.suggestedAt).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <p className="report-readonly-muted">No follow-up suggested.</p>
          )
        ) : (
          <Skeleton lines={1} />
        )}
      </Section>
    </div>
  );
}
