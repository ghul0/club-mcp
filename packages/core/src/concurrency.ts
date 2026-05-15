export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 8;

export async function concurrentMap<T, R>(
  items: ReadonlyArray<T>,
  fn: (item: T, index: number) => Promise<R>,
  limit: number = DEFAULT_CONCURRENCY,
): Promise<ReadonlyArray<R>> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`concurrency limit must be a positive integer, got ${String(limit)}`);
  }
  if (limit > MAX_CONCURRENCY) {
    throw new Error(
      `concurrency limit ${String(limit)} exceeds MAX_CONCURRENCY (${String(MAX_CONCURRENCY)})`,
    );
  }
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let cursor = 0;

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await fn(item, index);
    }
  });

  await Promise.all(workers);
  return results;
}
