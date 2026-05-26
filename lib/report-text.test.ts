import { describe, it, expect } from "vitest";
import { reportToPlainText } from "@/lib/report-text";

describe("reportToPlainText", () => {
  it("renders sections, a medication line, and deadlines", () => {
    const text = reportToPlainText(
      {
        riskFlags: [
          { category: "suicidal-ideation", quote: "no point", note: "assess" },
        ],
        summary: ["Low mood for 3 weeks"],
        medications: [
          {
            medicine: "Sertraline",
            dose: "50mg",
            timing: { morning: true, afternoon: false, night: true },
            duration: "4 weeks",
          },
        ],
        nextMeeting: { agenda: "Review", suggestedAt: null },
      },
      {
        freeVisitDeadline: "2026-05-28T09:00:00.000Z",
        medicineExpiryDate: "2026-07-25T09:00:00.000Z",
      },
    );
    expect(text).toContain("SUMMARY");
    expect(text).toContain("Sertraline 50mg");
    expect(text).toContain("Morning, Night");
    expect(text).toContain("RISK / SAFETY FLAGS");
    expect(text).toContain("Free-visit deadline");
  });
});
