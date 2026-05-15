import { describe, expect, it } from 'vitest';
import {
  type Result,
  ok,
  err,
  isOk,
  isErr,
} from '../src/result.js';

describe('Result', () => {
  it('constructs ok and err results', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    expect(err('failed')).toEqual({ ok: false, error: 'failed' });
  });

  it('narrows ok results with type guards', () => {
    const result: Result<string, string> = ok('value');

    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);

    if (!isOk(result)) {
      throw new Error('expected ok');
    }

    const value: string = result.value;
    expect(value).toBe('value');
  });

  it('narrows err results with type guards', () => {
    const result: Result<string, string> = err('failure');

    expect(isOk(result)).toBe(false);
    expect(isErr(result)).toBe(true);

    if (!isErr(result)) {
      throw new Error('expected err');
    }

    const error: string = result.error;
    expect(error).toBe('failure');
  });
});
