import type { AppError } from './errors.js';
import { validationError } from './errors.js';
import type { Result } from './result.js';
import { err, ok } from './result.js';

const pad2 = (n: number): string => (n < 10 ? `0${String(n)}` : String(n));

const pad4 = (n: number): string => {
  if (n < 10) {
    return `000${String(n)}`;
  }
  if (n < 100) {
    return `00${String(n)}`;
  }
  if (n < 1000) {
    return `0${String(n)}`;
  }
  return String(n);
};

export function formatWpLocal(d: Date): string {
  const y = pad4(d.getUTCFullYear());
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const TZ_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/;

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface TimeParts {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const todayParts = (now: Date): DateParts => ({
  year: now.getUTCFullYear(),
  month: now.getUTCMonth() + 1,
  day: now.getUTCDate(),
});

const yesterdayParts = (now: Date): DateParts => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 1);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
};

const isValid = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean => {
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }
  if (hour < 0 || hour > 23) {
    return false;
  }
  if (minute < 0 || minute > 59) {
    return false;
  }
  if (second < 0 || second > 59) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  if (d.getUTCFullYear() !== year) {
    return false;
  }
  if (d.getUTCMonth() !== month - 1) {
    return false;
  }
  if (d.getUTCDate() !== day) {
    return false;
  }
  return true;
};

const buildLocal = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string =>
  `${pad4(year)}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;

const reject = (input: string): Result<string, AppError> =>
  err(
    validationError(
      `unable to parse date input: ${JSON.stringify(input)}. expected ISO 8601, 'today HH:MM', 'yesterday HH:MM', or 'HH:MM'`,
    ),
  );

const parseTimeParts = (raw: string): TimeParts | null => {
  const match = TIME_RE.exec(raw);
  if (!match) {
    return null;
  }
  const [, hh, mm, ss] = match;
  if (hh === undefined || mm === undefined) {
    return null;
  }
  const hour = Number(hh);
  const minute = Number(mm);
  const second = ss === undefined ? 0 : Number(ss);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) {
    return null;
  }
  return { hour, minute, second };
};

export function parseSince(input: string, now?: Date): Result<string, AppError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return reject(input);
  }
  const base = now ?? new Date();
  const lower = trimmed.toLowerCase();

  if (lower === 'today') {
    const t = todayParts(base);
    return ok(buildLocal(t.year, t.month, t.day, 0, 0, 0));
  }

  if (lower === 'yesterday') {
    const t = yesterdayParts(base);
    return ok(buildLocal(t.year, t.month, t.day, 0, 0, 0));
  }

  if (lower.startsWith('today ')) {
    const rest = trimmed.slice('today '.length).trim();
    const time = parseTimeParts(rest);
    if (!time) {
      return reject(input);
    }
    const t = todayParts(base);
    if (!isValid(t.year, t.month, t.day, time.hour, time.minute, time.second)) {
      return reject(input);
    }
    return ok(buildLocal(t.year, t.month, t.day, time.hour, time.minute, time.second));
  }

  if (lower.startsWith('yesterday ')) {
    const rest = trimmed.slice('yesterday '.length).trim();
    const time = parseTimeParts(rest);
    if (!time) {
      return reject(input);
    }
    const t = yesterdayParts(base);
    if (!isValid(t.year, t.month, t.day, time.hour, time.minute, time.second)) {
      return reject(input);
    }
    return ok(buildLocal(t.year, t.month, t.day, time.hour, time.minute, time.second));
  }

  const plainTime = parseTimeParts(trimmed);
  if (plainTime) {
    if (!isValid(2000, 1, 1, plainTime.hour, plainTime.minute, plainTime.second)) {
      return reject(input);
    }
    const t = todayParts(base);
    return ok(buildLocal(t.year, t.month, t.day, plainTime.hour, plainTime.minute, plainTime.second));
  }

  const stripped = trimmed.replace(TZ_SUFFIX_RE, '').trim();

  const dateOnly = DATE_ONLY_RE.exec(stripped);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    if (y === undefined || m === undefined || d === undefined) {
      return reject(input);
    }
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!isValid(year, month, day, 0, 0, 0)) {
      return reject(input);
    }
    return ok(buildLocal(year, month, day, 0, 0, 0));
  }

  const dateTime = DATE_TIME_RE.exec(stripped);
  if (dateTime) {
    const [, y, m, d, hh, mm, ss] = dateTime;
    if (y === undefined || m === undefined || d === undefined || hh === undefined || mm === undefined) {
      return reject(input);
    }
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const hour = Number(hh);
    const minute = Number(mm);
    const second = ss === undefined ? 0 : Number(ss);
    if (!isValid(year, month, day, hour, minute, second)) {
      return reject(input);
    }
    return ok(buildLocal(year, month, day, hour, minute, second));
  }

  return reject(input);
}
