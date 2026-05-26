import type { ProviderId } from "@/lib/domain/report/schema";
import { env } from "@/lib/config/env";
import type { TranscriptionProvider } from "./provider";
import { OpenAITranscriptionProvider } from "./openai";
import { SarvamTranscriptionProvider } from "./sarvam";
import { AmazonTranscriptionProvider } from "./amazon";

export type ProviderFactories = Record<ProviderId, () => TranscriptionProvider>;

export function createRegistry(factories: ProviderFactories) {
  return {
    get(id: ProviderId): TranscriptionProvider {
      const make = factories[id];
      if (!make) throw new Error(`Unknown transcription provider: ${id}`);
      return make();
    },
  };
}

const defaultFactories: ProviderFactories = {
  openai: () => new OpenAITranscriptionProvider(),
  sarvam: () => new SarvamTranscriptionProvider(),
  amazon: () => new AmazonTranscriptionProvider(),
};

const registry = createRegistry(defaultFactories);

export function getTranscriptionProvider(
  id: ProviderId = env().DEFAULT_PROVIDER,
): TranscriptionProvider {
  return registry.get(id);
}
