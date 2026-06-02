export function normalizeAudioSeconds(
  seconds: number | null | undefined,
): number | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return null;
  }
  if (seconds <= 0) return null;
  return Math.max(Math.round(seconds), 1);
}

export function formatAudioDuration(
  seconds: number | null | undefined,
): string | null {
  const normalized = normalizeAudioSeconds(seconds);
  if (normalized === null) return null;
  if (normalized < 60) return `${normalized}s`;

  const minutes = Math.floor(normalized / 60);
  const remainingSeconds = normalized % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
