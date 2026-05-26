import type { ReportSection } from "@/lib/domain/report/schema";

export interface ReportGenerator {
  readonly id: string;
  /**
   * Stream the report one section at a time as the model produces it.
   * Consumers can render each section the moment it arrives.
   */
  generateStream(transcript: string): AsyncGenerator<ReportSection>;
}
