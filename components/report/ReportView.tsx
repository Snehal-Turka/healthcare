"use client";
import { useState } from "react";
import type { ReportRecord } from "@/lib/adapters/repository/report-repository";
import type { ReportContent } from "@/lib/domain/report/schema";
import { RiskFlags } from "./RiskFlags";
import { SummaryList } from "./SummaryList";
import { MedicationTable } from "./MedicationTable";
import { NextMeeting } from "./NextMeeting";
import { Deadlines } from "./Deadlines";
import { ReportActions } from "./ReportActions";
import { Timings } from "./Timings";

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

export function ReportView({ report }: { report: ReportRecord }) {
  return <ReportEditor key={report.id} report={report} />;
}

function ReportEditor({ report }: { report: ReportRecord }) {
  const [content, setContent] = useState<ReportContent>(
    report.content ?? {
      riskFlags: [],
      summary: [],
      medications: [],
      nextMeeting: null,
    },
  );

  return (
    <div id="printable" className="report-workspace">
      <ReportActions
        reportId={report.id}
        content={content}
        freeVisitDeadline={report.freeVisitDeadline}
        medicineExpiryDate={report.medicineExpiryDate}
      />
      <Timings timings={report.stageTimings} />
      <Section title="Risk / Safety Flags">
        <RiskFlags flags={content.riskFlags} />
      </Section>
      <Section title="Summary">
        <SummaryList
          items={content.summary}
          onChange={(summary) => setContent({ ...content, summary })}
        />
      </Section>
      <Section title="Medication Schedule">
        <MedicationTable
          rows={content.medications}
          onChange={(medications) => setContent({ ...content, medications })}
        />
      </Section>
      <Section title="Next Meeting">
        <NextMeeting
          value={content.nextMeeting}
          onChange={(nextMeeting) => setContent({ ...content, nextMeeting })}
        />
      </Section>
      <Deadlines
        freeVisitDeadline={report.freeVisitDeadline}
        medicineExpiryDate={report.medicineExpiryDate}
      />
    </div>
  );
}
