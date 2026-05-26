import { z } from "zod";

export const RiskFlagSchema = z.object({
  category: z.enum(["self-harm", "suicidal-ideation", "crisis", "other"]),
  quote: z.string(),
  note: z.string(),
});

export const TimingSchema = z.object({
  morning: z.boolean(),
  afternoon: z.boolean(),
  night: z.boolean(),
  custom: z.string().optional(),
});

export const MedicationSchema = z.object({
  medicine: z.string(),
  dose: z.string(),
  timing: TimingSchema,
  duration: z.string(),
});

export const NextMeetingSchema = z
  .object({ agenda: z.string(), suggestedAt: z.string().nullable() })
  .nullable();

export const ReportContentSchema = z.object({
  riskFlags: z.array(RiskFlagSchema),
  summary: z.array(z.string()),
  medications: z.array(MedicationSchema),
  nextMeeting: NextMeetingSchema,
});

export type RiskFlag = z.infer<typeof RiskFlagSchema>;
export type Timing = z.infer<typeof TimingSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type NextMeeting = z.infer<typeof NextMeetingSchema>;
export type ReportContent = z.infer<typeof ReportContentSchema>;

/**
 * A single report section produced incrementally while the model streams.
 * The generator emits one of these per parsed NDJSON line.
 */
export type ReportSection =
  | { section: "riskFlags"; data: RiskFlag[] }
  | { section: "summary"; data: string[] }
  | { section: "medications"; data: Medication[] }
  | { section: "nextMeeting"; data: NextMeeting | null };

export type ReportSectionName = ReportSection["section"];

const SectionDataSchemas = {
  riskFlags: z.array(RiskFlagSchema),
  summary: z.array(z.string()),
  medications: z.array(MedicationSchema),
  nextMeeting: NextMeetingSchema,
} as const;

/**
 * Parse one NDJSON line of the form `{ "section": <name>, "data": <value> }`,
 * validating `data` against the schema for that section. Returns null for
 * blank lines, malformed JSON, unknown sections, or data that fails validation.
 */
export function parseSectionLine(raw: string): ReportSection | null {
  const line = raw.trim();
  if (!line) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const { section, data } = obj as { section?: unknown; data?: unknown };
  if (typeof section !== "string" || !(section in SectionDataSchemas))
    return null;
  const name = section as ReportSectionName;
  const parsed = SectionDataSchemas[name].safeParse(data);
  if (!parsed.success) return null;
  return { section: name, data: parsed.data } as ReportSection;
}

export type ReportStatus = "processing" | "ready" | "failed";
export type ProviderId = "openai" | "sarvam" | "amazon";
export type StageTimings = {
  ingestMs?: number;
  transcribeMs?: number;
  generateMs?: number;
};
