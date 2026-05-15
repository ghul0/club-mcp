export interface RedactionOptions {
  readonly blocklistKeys?: ReadonlyArray<string>;
  readonly placeholder?: string;
}

const DEFAULT_BLOCKLIST: ReadonlyArray<string> = [
  'email',
  'token',
  'password',
  'nonce',
  'cookie',
  'authorization',
  'secret',
  'app_pass',
  'private_key',
  'refresh_token',
];

const DEFAULT_PLACEHOLDER = '[REDACTED]';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const walk = (
  value: unknown,
  blocklist: ReadonlySet<string>,
  placeholder: string,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, blocklist, placeholder));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      if (blocklist.has(key.toLowerCase())) {
        result[key] = placeholder;
      } else {
        result[key] = walk(child, blocklist, placeholder);
      }
    }

    return result;
  }

  return value;
};

export function redactKeys<T>(value: T, options?: RedactionOptions): T {
  const blocklistSource = options?.blocklistKeys ?? DEFAULT_BLOCKLIST;
  const blocklist = new Set(blocklistSource.map((key) => key.toLowerCase()));
  const placeholder = options?.placeholder ?? DEFAULT_PLACEHOLDER;

  return walk(value, blocklist, placeholder) as T;
}

const ENTITY_MAP: ReadonlyMap<string, string> = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&nbsp;', ' '],
]);

export function htmlToText(html: string): string {
  let result = html.replace(/<[^>]*>/g, ' ');

  for (const [entity, replacement] of ENTITY_MAP) {
    result = result.split(entity).join(replacement);
  }

  return result.replace(/\s+/g, ' ').trim();
}

export function truncate(text: string, max: number): string {
  const limit = max < 0 ? 0 : max;
  const codePoints = Array.from(text);

  if (codePoints.length <= limit) {
    return text;
  }

  return codePoints.slice(0, limit).join('') + '…';
}
