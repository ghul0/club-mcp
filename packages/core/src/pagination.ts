import type { Result } from './result.js';
import { err, ok } from './result.js';
import type { AppError } from './errors.js';

export interface PageRequest {
  readonly page: number;
  readonly perPage: number;
}

export interface Page<T> {
  readonly items: ReadonlyArray<T>;
  readonly hasMore: boolean;
  readonly totalScanned: number;
}

export interface PaginateOptions {
  readonly maxItems?: number;
  readonly maxPages?: number;
  readonly perPage?: number;
}

const DEFAULT_MAX_ITEMS = 500;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_PER_PAGE = 100;

export async function paginate<T>(
  fetchPage: (req: PageRequest) => Promise<Result<Page<T>, AppError>>,
  options?: PaginateOptions,
): Promise<Result<ReadonlyArray<T>, AppError>> {
  const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const perPage = options?.perPage ?? DEFAULT_PER_PAGE;

  const collected: T[] = [];
  let pageNumber = 1;

  while (pageNumber <= maxPages) {
    const result = await fetchPage({ page: pageNumber, perPage });

    if (!result.ok) {
      return err(result.error);
    }

    for (const item of result.value.items) {
      if (collected.length >= maxItems) {
        break;
      }
      collected.push(item);
    }

    if (collected.length >= maxItems) {
      return ok(collected.slice(0, maxItems));
    }

    if (!result.value.hasMore) {
      return ok(collected);
    }

    pageNumber += 1;
  }

  return ok(collected);
}
