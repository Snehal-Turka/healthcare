import type { ReportGenerator } from "./generator";
import { OpenAIReportGenerator } from "./openai-generator";

export function getReportGenerator(): ReportGenerator {
  return new OpenAIReportGenerator();
}
