import { describe, expect, it } from 'vitest';
import {
  type Result,
  ok,
  err,
  isOk,
  isErr,
  map,
  flatMap,
  match
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

  it('maps ok results with identity and composition', () => {
    const result = ok(2);
    const addOne = (value: number) => value + 1;
    const double = (value: number) => value * 2;

    expect(map(result, (value) => value)).toEqual(result);
    expect(map(map(result, addOne), double)).toEqual(map(result, (value) => double(addOne(value))));
  });

  it('keeps err results unchanged when mapping', () => {
    const result: Result<number, string> = err('failure');
    let called = false;

    expect(map(result, (value) => {
      called = true;
      return value + 1;
    })).toEqual(err('failure'));
    expect(called).toBe(false);
  });

  it('flatMaps ok results through a chain', () => {
    const result = flatMap(
      flatMap(ok(2), (value) => ok(value + 1)),
      (value) => ok(`value:${value}`)
    );

    expect(result).toEqual(ok('value:3'));
  });

  it('short-circuits flatMap on errors', () => {
    const result: Result<number, string> = err('failure');
    let called = false;

    expect(flatMap(result, (value) => {
      called = true;
      return ok(value + 1);
    })).toEqual(err('failure'));
    expect(called).toBe(false);
  });

  it('matches ok and err cases exhaustively', () => {
    const cases = {
      ok: (value: number) => `ok:${value}`,
      err: (error: string) => `err:${error}`
    };

    expect(match(ok(7), cases)).toBe('ok:7');
    expect(match(err('failure'), cases)).toBe('err:failure');
  });
});
