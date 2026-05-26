import type { ReportContent, Medication } from "@/lib/domain/report/schema";

function timingLabel(t: Medication["timing"]): string {
  const parts = [
    t.morning && "Morning",
    t.afternoon && "Afternoon",
    t.night && "Night",
  ].filter(Boolean) as string[];
  if (t.custom) parts.push(t.custom);
  return parts.length ? parts.join(", ") : "—";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function reportToPlainText(
  content: ReportContent,
  deadlines: {
    freeVisitDeadline: string | null;
    medicineExpiryDate: string | null;
  },
): string {
  const lines: string[] = [];

  if (content.riskFlags.length) {
    lines.push("RISK / SAFETY FLAGS (alerts, not diagnoses)");
    for (const f of content.riskFlags)
      lines.push(`- [${f.category}] "${f.quote}" — ${f.note}`);
    lines.push("");
  }

  lines.push("SUMMARY");
  for (const s of content.summary) lines.push(`- ${s}`);
  lines.push("");

  lines.push("MEDICATION SCHEDULE");
  for (const m of content.medications)
    lines.push(
      `- ${m.medicine} ${m.dose} — ${timingLabel(m.timing)} — ${m.duration}`,
    );
  if (!content.medications.length) lines.push("- (none)");
  lines.push("");

  if (content.nextMeeting) {
    lines.push("NEXT MEETING");
    lines.push(
      `- ${content.nextMeeting.agenda}${content.nextMeeting.suggestedAt ? ` (${fmtDate(content.nextMeeting.suggestedAt)})` : ""}`,
    );
    lines.push("");
  }

  lines.push(`Free-visit deadline: ${fmtDate(deadlines.freeVisitDeadline)}`);
  lines.push(
    `Medicine expiry / mandatory revisit: ${fmtDate(deadlines.medicineExpiryDate)}`,
  );

  return lines.join("\n");
}
