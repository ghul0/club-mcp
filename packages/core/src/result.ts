export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  if (r.ok) {
    return ok(fn(r.value));
  }

  return err(r.error);
}

export function flatMap<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> {
  if (r.ok) {
    return fn(r.value);
  }

  return err(r.error);
}

export function match<T, E, R>(r: Result<T, E>, cases: { ok: (v: T) => R; err: (e: E) => R }): R {
  if (r.ok) {
    return cases.ok(r.value);
  }

  return cases.err(r.error);
}
