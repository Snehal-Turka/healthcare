import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { PrismaReportRepository } from "@/lib/adapters/repository/prisma-report-repository";
import { LocalStorage } from "@/lib/adapters/storage/local-storage";
import { DiscardingStorage } from "@/lib/adapters/storage/discarding-storage";
import type { Storage } from "@/lib/adapters/storage/storage";
import { getTranscriptionProvider } from "@/lib/adapters/transcription/registry";
import { getReportGenerator } from "@/lib/adapters/generation/registry";
import type { PipelineDeps } from "./orchestrator";
import type { Env } from "@/lib/config/env";

export function productionStorage(config: Env = env()): Storage {
  if (config.RETAIN_AUDIO) return new LocalStorage(config.STORAGE_DIR);
  return new DiscardingStorage();
}

export function productionDeps(): PipelineDeps {
  return {
    repo: new PrismaReportRepository(prisma),
    storage: productionStorage(),
    getProvider: (id) => getTranscriptionProvider(id),
    generator: getReportGenerator(),
  };
}
