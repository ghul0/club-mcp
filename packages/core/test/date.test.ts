import { describe, expect, it } from 'vitest';
import { formatWpLocal, parseSince } from '../src/date.js';
import { isErr, isOk } from '../src/result.js';

const fixedNow = new Date(Date.UTC(2026, 4, 15, 8, 30, 0));

describe('parseSince', () => {
  it('parses ISO date-only as 00:00:00', () => {
    const result = parseSince('2026-05-15', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 00:00:00');
  });

  it('parses ISO date with space separator and HH:MM', () => {
    const result = parseSince('2026-05-15 12:00', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 12:00:00');
  });

  it('parses ISO date with T separator and seconds', () => {
    const result = parseSince('2026-05-15T12:00:00', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 12:00:00');
  });

  it('parses today HH:MM', () => {
    const result = parseSince('today 14:30', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 14:30:00');
  });

  it('parses today (no time) as 00:00:00', () => {
    const result = parseSince('today', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 00:00:00');
  });

  it('parses yesterday as 00:00:00', () => {
    const result = parseSince('yesterday', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-14 00:00:00');
  });

  it('parses yesterday HH:MM', () => {
    const result = parseSince('yesterday 09:15', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-14 09:15:00');
  });

  it('parses plain HH:MM as today', () => {
    const result = parseSince('07:45', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 07:45:00');
  });

  it('parses plain HH:MM:SS as today', () => {
    const result = parseSince('07:45:12', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 07:45:12');
  });

  it('trims leading and trailing whitespace', () => {
    const result = parseSince('   today 14:30   ', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 14:30:00');
  });

  it('accepts mixed case TODAY', () => {
    const result = parseSince('TODAY 14:30', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 14:30:00');
  });

  it('accepts mixed case Yesterday', () => {
    const result = parseSince('Yesterday 09:15', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-14 09:15:00');
  });

  it('strips trailing Z timezone', () => {
    const result = parseSince('2026-05-15T12:00:00Z', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 12:00:00');
  });

  it('strips trailing numeric offset', () => {
    const result = parseSince('2026-05-15T12:00:00+02:00', fixedNow);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 12:00:00');
  });

  it('rejects empty string', () => {
    const result = parseSince('', fixedNow);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error('expected err');
    }
    expect(result.error.code).toBe('validation');
  });

  it('rejects whitespace-only string', () => {
    const result = parseSince('   ', fixedNow);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error('expected err');
    }
    expect(result.error.code).toBe('validation');
  });

  it('rejects tomorrow', () => {
    const result = parseSince('tomorrow', fixedNow);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error('expected err');
    }
    expect(result.error.code).toBe('validation');
  });

  it('rejects random garbage', () => {
    const result = parseSince('abc', fixedNow);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error('expected err');
    }
    expect(result.error.code).toBe('validation');
  });

  it('rejects incomplete today asdf', () => {
    const result = parseSince('today asdf', fixedNow);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error('expected err');
    }
    expect(result.error.code).toBe('validation');
  });

  it('rejects yesterday with garbage suffix', () => {
    const result = parseSince('yesterday abc', fixedNow);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error('expected err');
    }
    expect(result.error.code).toBe('validation');
  });

  it('rejects invalid hour', () => {
    const result = parseSince('25:00', fixedNow);
    expect(isErr(result)).toBe(true);
  });

  it('rejects invalid minute', () => {
    const result = parseSince('12:60', fixedNow);
    expect(isErr(result)).toBe(true);
  });

  it('rejects invalid ISO date', () => {
    const result = parseSince('2026-13-40', fixedNow);
    expect(isErr(result)).toBe(true);
  });

  it('uses default now when not provided', () => {
    const result = parseSince('2026-05-15 12:00');
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-15 12:00:00');
  });

  it('handles yesterday across month boundary', () => {
    const startOfMonth = new Date(Date.UTC(2026, 5, 1, 0, 0, 0));
    const result = parseSince('yesterday', startOfMonth);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2026-05-31 00:00:00');
  });

  it('handles yesterday across year boundary', () => {
    const startOfYear = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const result = parseSince('yesterday', startOfYear);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error('expected ok');
    }
    expect(result.value).toBe('2025-12-31 00:00:00');
  });
});

describe('formatWpLocal', () => {
  it('formats a date with zero padding', () => {
    const d = new Date(Date.UTC(2026, 0, 5, 3, 7, 9));
    expect(formatWpLocal(d)).toBe('2026-01-05 03:07:09');
  });

  it('formats a date with double digits', () => {
    const d = new Date(Date.UTC(2026, 10, 25, 14, 30, 45));
    expect(formatWpLocal(d)).toBe('2026-11-25 14:30:45');
  });

  it('formats midnight', () => {
    const d = new Date(Date.UTC(2026, 4, 15, 0, 0, 0));
    expect(formatWpLocal(d)).toBe('2026-05-15 00:00:00');
  });
});
