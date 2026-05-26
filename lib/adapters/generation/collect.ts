import type { ReportContent, ReportSection } from "@/lib/domain/report/schema";

/**
 * Drain a section stream into a complete ReportContent, defaulting any section
 * the model never emitted. Useful for tests and any non-streaming consumer.
 */
export async function collectReport(
  stream: AsyncGenerator<ReportSection>,
): Promise<ReportContent> {
  const content: ReportContent = {
    riskFlags: [],
    summary: [],
    medications: [],
    nextMeeting: null,
  };
  for await (const section of stream) {
    applySection(content, section);
  }
  return content;
}

/** Merge a single streamed section into an accumulating ReportContent. */
export function applySection(
  content: ReportContent,
  section: ReportSection,
): void {
  switch (section.section) {
    case "riskFlags":
      content.riskFlags = section.data;
      break;
    case "summary":
      content.summary = section.data;
      break;
    case "medications":
      content.medications = section.data;
      break;
    case "nextMeeting":
      content.nextMeeting = section.data;
      break;
  }
}
