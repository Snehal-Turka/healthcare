import { describe, it, expect } from "vitest";
import { ReportContentSchema } from "@/lib/domain/report/schema";

describe("ReportContentSchema", () => {
  it("parses a valid report content object", () => {
    const input = {
      riskFlags: [
        {
          category: "suicidal-ideation",
          quote: "I feel hopeless",
          note: "Assess risk",
        },
      ],
      summary: ["Patient reports low mood for 3 weeks"],
      medications: [
        {
          medicine: "Sertraline",
          dose: "50mg",
          timing: { morning: true, afternoon: false, night: false },
          duration: "4 weeks",
        },
      ],
      nextMeeting: {
        agenda: "Review response",
        suggestedAt: "2026-06-10T10:00:00.000Z",
      },
    };
    const parsed = ReportContentSchema.parse(input);
    expect(parsed.medications[0].medicine).toBe("Sertraline");
    expect(parsed.nextMeeting?.agenda).toBe("Review response");
  });

  it("allows nextMeeting to be null", () => {
    const parsed = ReportContentSchema.parse({
      riskFlags: [],
      summary: [],
      medications: [],
      nextMeeting: null,
    });
    expect(parsed.nextMeeting).toBeNull();
  });

  it("rejects an unknown risk category", () => {
    expect(() =>
      ReportContentSchema.parse({
        riskFlags: [{ category: "banana", quote: "", note: "" }],
        summary: [],
        medications: [],
        nextMeeting: null,
      }),
    ).toThrow();
  });
});
