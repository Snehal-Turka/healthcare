import { describe, it, expect } from "vitest";
import { createRegistry } from "@/lib/adapters/transcription/registry";
import { FakeTranscriptionProvider } from "@/lib/adapters/transcription/fake";

describe("transcription registry", () => {
  it("returns the provider for a given id", () => {
    const reg = createRegistry({
      openai: () => new FakeTranscriptionProvider("openai"),
      sarvam: () => new FakeTranscriptionProvider("sarvam"),
      amazon: () => new FakeTranscriptionProvider("amazon"),
    });
    expect(reg.get("sarvam").id).toBe("sarvam");
  });

  it("throws for an unknown id", () => {
    const reg = createRegistry({
      openai: () => new FakeTranscriptionProvider("openai"),
    } as never);
    // @ts-expect-error intentionally invalid
    expect(() => reg.get("nope")).toThrow();
  });
});
