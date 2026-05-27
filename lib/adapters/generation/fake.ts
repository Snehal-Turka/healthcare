import type {
  ApiCostLineItem,
  ReportContent,
  ReportSection,
} from "@/lib/domain/report/schema";
import type { ReportGenerator } from "./generator";

export class FakeReportGenerator implements ReportGenerator {
  readonly id = "fake";
  public lastTranscript: string | null = null;

  constructor(
    private readonly content: ReportContent = {
      riskFlags: [],
      summary: ["Patient reports low mood and poor sleep for three weeks."],
      medications: [
        {
          medicine: "Sertraline",
          dose: "50mg",
          timing: { morning: true, afternoon: false, night: false },
          duration: "4 weeks",
        },
      ],
      nextMeeting: { agenda: "Review medication response", suggestedAt: null },
    },
    private readonly costLineItems: ApiCostLineItem[] = [],
  ) {}

  async *generateStream(transcript: string): AsyncGenerator<ReportSection> {
    this.lastTranscript = transcript;
    yield { section: "riskFlags", data: this.content.riskFlags };
    yield { section: "summary", data: this.content.summary };
    yield { section: "medications", data: this.content.medications };
    yield { section: "nextMeeting", data: this.content.nextMeeting };
  }

  getCostLineItems(): ApiCostLineItem[] {
    return this.costLineItems;
  }
}
