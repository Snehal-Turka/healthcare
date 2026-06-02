import { describe, expect, it } from "vitest";
import { formatAudioDuration, normalizeAudioSeconds } from "./audio-duration";

describe("audio duration", () => {
  it("formats missing durations as hidden metadata", () => {
    expect(formatAudioDuration(null)).toBeNull();
    expect(formatAudioDuration(undefined)).toBeNull();
  });

  it("formats durations under one minute as seconds", () => {
    expect(formatAudioDuration(45)).toBe("45s");
  });

  it("formats durations from one minute upward as minutes and seconds", () => {
    expect(formatAudioDuration(60)).toBe("1:00");
    expect(formatAudioDuration(95)).toBe("1:35");
  });

  it("normalizes incoming duration to positive whole seconds", () => {
    expect(normalizeAudioSeconds(undefined)).toBeNull();
    expect(normalizeAudioSeconds(Number.NaN)).toBeNull();
    expect(normalizeAudioSeconds(0)).toBeNull();
    expect(normalizeAudioSeconds(0.4)).toBe(1);
    expect(normalizeAudioSeconds(94.6)).toBe(95);
  });
});
