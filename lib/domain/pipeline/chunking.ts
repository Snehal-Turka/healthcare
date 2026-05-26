const MAX_OVERLAP_WORDS = 6;

export function stitchTranscripts(parts: string[]): string {
  const clean = parts.map((part) => part.trim()).filter(Boolean);
  if (clean.length === 0) return "";

  return clean.reduce((acc, next) => {
    if (!acc) return next;

    const accWords = acc.split(/\s+/);
    const nextWords = next.split(/\s+/);
    const max = Math.min(
      MAX_OVERLAP_WORDS,
      accWords.length,
      nextWords.length,
    );

    for (let n = max; n > 0; n--) {
      const tail = accWords.slice(-n).join(" ").toLowerCase();
      const head = nextWords.slice(0, n).join(" ").toLowerCase();
      if (tail === head) return [...accWords, ...nextWords.slice(n)].join(" ");
    }

    return `${acc} ${next}`;
  }, "");
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
