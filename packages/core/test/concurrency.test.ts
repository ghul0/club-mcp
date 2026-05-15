import { describe, expect, it } from 'vitest';
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY, concurrentMap } from '../src/concurrency.js';

describe('concurrentMap', () => {
  it('preserves input order in output', async () => {
    const result = await concurrentMap([1, 2, 3, 4, 5], async (n) => n * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('returns empty array on empty input', async () => {
    const result = await concurrentMap([], async (n: number) => n);
    expect(result).toEqual([]);
  });

  it('passes index to fn', async () => {
    const result = await concurrentMap(['a', 'b', 'c'], async (item, idx) => `${idx}:${item}`);
    expect(result).toEqual(['0:a', '1:b', '2:c']);
  });

  it('respects concurrency limit (never exceeds)', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 16 }, (_, i) => i);
    await concurrentMap(items, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    }, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('defaults to DEFAULT_CONCURRENCY when limit omitted', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    await concurrentMap(items, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 3));
      active -= 1;
    });
    expect(peak).toBeLessThanOrEqual(DEFAULT_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it('propagates rejected promise from fn', async () => {
    await expect(
      concurrentMap([1, 2, 3], async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('rejects limit below 1', async () => {
    await expect(concurrentMap([1], async (n) => n, 0)).rejects.toThrow(/positive integer/);
    await expect(concurrentMap([1], async (n) => n, -1)).rejects.toThrow(/positive integer/);
  });

  it('rejects non-integer limit', async () => {
    await expect(concurrentMap([1], async (n) => n, 1.5)).rejects.toThrow(/positive integer/);
  });

  it('rejects limit above MAX_CONCURRENCY', async () => {
    await expect(concurrentMap([1], async (n) => n, MAX_CONCURRENCY + 1)).rejects.toThrow(/MAX_CONCURRENCY/);
  });

  it('handles limit larger than items count', async () => {
    const result = await concurrentMap([1, 2], async (n) => n * 10, 8);
    expect(result).toEqual([10, 20]);
  });
});
