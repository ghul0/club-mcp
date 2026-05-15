import { describe, expect, it, vi } from 'vitest';
import type { Result } from '../src/result.js';
import { err, ok } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import { externalService, upstreamForbidden } from '../src/errors.js';
import type { Page, PageRequest } from '../src/pagination.js';
import { paginate } from '../src/pagination.js';

const page = <T>(items: ReadonlyArray<T>, hasMore: boolean, totalScanned?: number): Page<T> => ({
  items,
  hasMore,
  totalScanned: totalScanned ?? items.length,
});

describe('paginate', () => {
  it('returns an empty array when the first page is empty and hasMore is false', async () => {
    const fetchPage = vi.fn(async (_req: PageRequest): Promise<Result<Page<number>, AppError>> =>
      ok(page<number>([], false)),
    );

    const result = await paginate(fetchPage);

    expect(result).toEqual(ok([]));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith({ page: 1, perPage: 100 });
  });

  it('returns the only page when hasMore is false on the first call', async () => {
    const fetchPage = vi.fn(async (_req: PageRequest): Promise<Result<Page<number>, AppError>> =>
      ok(page([1, 2, 3], false)),
    );

    const result = await paginate(fetchPage);

    expect(result).toEqual(ok([1, 2, 3]));
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('walks multiple pages and concatenates results until hasMore is false', async () => {
    const pages: ReadonlyArray<Page<number>> = [
      page([1, 2, 3], true),
      page([4, 5, 6], true),
      page([7, 8], false),
    ];

    const fetchPage = vi.fn(async (req: PageRequest): Promise<Result<Page<number>, AppError>> => {
      const index = req.page - 1;
      const current = pages[index];
      if (current === undefined) {
        return err(externalService(`unexpected page ${String(req.page)}`));
      }
      return ok(current);
    });

    const result = await paginate(fetchPage, { perPage: 3 });

    expect(result).toEqual(ok([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { page: 1, perPage: 3 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { page: 2, perPage: 3 });
    expect(fetchPage).toHaveBeenNthCalledWith(3, { page: 3, perPage: 3 });
  });

  it('stops walking when maxPages is reached even if hasMore is true', async () => {
    const fetchPage = vi.fn(async (req: PageRequest): Promise<Result<Page<number>, AppError>> =>
      ok(page([req.page * 10], true)),
    );

    const result = await paginate(fetchPage, { perPage: 1, maxPages: 2, maxItems: 100 });

    expect(result).toEqual(ok([10, 20]));
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('truncates items to maxItems and stops paginating when the cap is reached', async () => {
    const fetchPage = vi.fn(async (req: PageRequest): Promise<Result<Page<number>, AppError>> => {
      const start = (req.page - 1) * 3 + 1;
      return ok(page([start, start + 1, start + 2], true));
    });

    const result = await paginate(fetchPage, { perPage: 3, maxItems: 7, maxPages: 20 });

    expect(result).toEqual(ok([1, 2, 3, 4, 5, 6, 7]));
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('short-circuits and returns the err from fetchPage', async () => {
    const failure = upstreamForbidden('forbidden');
    const fetchPage = vi.fn(async (req: PageRequest): Promise<Result<Page<number>, AppError>> => {
      if (req.page === 1) {
        return ok(page([1, 2], true));
      }
      return err(failure);
    });

    const result = await paginate(fetchPage, { perPage: 2 });

    expect(result).toEqual(err(failure));
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('passes the configured perPage to fetchPage', async () => {
    const fetchPage = vi.fn(async (_req: PageRequest): Promise<Result<Page<number>, AppError>> =>
      ok(page([1], false)),
    );

    await paginate(fetchPage, { perPage: 25 });

    expect(fetchPage).toHaveBeenCalledWith({ page: 1, perPage: 25 });
  });

  it('uses default caps when no options are provided', async () => {
    const fetchPage = vi.fn(async (_req: PageRequest): Promise<Result<Page<number>, AppError>> =>
      ok(page([1, 2], true)),
    );

    const result = await paginate(fetchPage);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.value.length).toBe(40);
    expect(fetchPage).toHaveBeenCalledTimes(20);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { page: 1, perPage: 100 });
  });
});
