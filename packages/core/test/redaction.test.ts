import { describe, expect, it } from 'vitest';
import { redactKeys, htmlToText, truncate } from '../src/redaction.js';

describe('redactKeys', () => {
  it('redacts default-blocklisted top-level keys', () => {
    const input = {
      id: 1,
      email: 'user@example.com',
      token: 'abc',
      name: 'Alice',
    };

    expect(redactKeys(input)).toEqual({
      id: 1,
      email: '[REDACTED]',
      token: '[REDACTED]',
      name: 'Alice',
    });
  });

  it('walks deeply nested objects and arrays', () => {
    const input = {
      user: {
        profile: {
          email: 'a@b.c',
          public: 'ok',
        },
        sessions: [
          { token: 'x', last_seen: 'now' },
          { token: 'y', last_seen: 'then' },
        ],
      },
      tags: ['a', 'b'],
    };

    expect(redactKeys(input)).toEqual({
      user: {
        profile: {
          email: '[REDACTED]',
          public: 'ok',
        },
        sessions: [
          { token: '[REDACTED]', last_seen: 'now' },
          { token: '[REDACTED]', last_seen: 'then' },
        ],
      },
      tags: ['a', 'b'],
    });
  });

  it('matches blocklisted keys case-insensitively', () => {
    const input = {
      Email: 'a@b.c',
      AUTHORIZATION: 'Bearer abc',
      Cookie: 'sid=1',
      App_Pass: 'p',
      Refresh_Token: 'r',
      Private_Key: 'k',
      keep: 'me',
    };

    expect(redactKeys(input)).toEqual({
      Email: '[REDACTED]',
      AUTHORIZATION: '[REDACTED]',
      Cookie: '[REDACTED]',
      App_Pass: '[REDACTED]',
      Refresh_Token: '[REDACTED]',
      Private_Key: '[REDACTED]',
      keep: 'me',
    });
  });

  it('is idempotent', () => {
    const input = {
      email: 'a@b.c',
      nested: { password: 'p', items: [{ secret: 's' }] },
    };

    const once = redactKeys(input);
    const twice = redactKeys(once);

    expect(twice).toEqual(once);
  });

  it('honors a custom blocklist and placeholder', () => {
    const input = { ssn: '123', email: 'a@b.c', name: 'Alice' };

    expect(
      redactKeys(input, { blocklistKeys: ['ssn'], placeholder: '***' }),
    ).toEqual({ ssn: '***', email: 'a@b.c', name: 'Alice' });
  });

  it('preserves object shape and primitive inputs', () => {
    expect(redactKeys('plain')).toBe('plain');
    expect(redactKeys(42)).toBe(42);
    expect(redactKeys(null)).toBeNull();
    expect(redactKeys(undefined)).toBeUndefined();

    const input = { a: 1, email: 'x' };
    const out = redactKeys(input);

    expect(Object.keys(out)).toEqual(['a', 'email']);
  });
});

describe('htmlToText', () => {
  it('strips simple tags', () => {
    expect(htmlToText('<p>hello</p>')).toBe('hello');
  });

  it('strips multiple and nested tags', () => {
    expect(
      htmlToText('<div><p>hello <b>world</b></p><br/><span>x</span></div>'),
    ).toBe('hello world x');
  });

  it('decodes common HTML entities', () => {
    expect(htmlToText('Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;ok&#39;')).toBe(
      'Tom & Jerry <3 "hi" \'ok\'',
    );
  });

  it('decodes nbsp and collapses whitespace', () => {
    expect(htmlToText('a&nbsp;b   c\n\nd')).toBe('a b c d');
  });

  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText('   ')).toBe('');
  });

  it('handles tags with attributes', () => {
    expect(htmlToText('<a href="https://x">link</a>')).toBe('link');
  });
});

describe('truncate', () => {
  it('returns input unchanged when length is below max', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });

  it('returns input unchanged when length exactly equals max', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('appends ellipsis when input exceeds max', () => {
    expect(truncate('abcdef', 3)).toBe('abc…');
  });

  it('returns just ellipsis when max is zero', () => {
    expect(truncate('abc', 0)).toBe('…');
  });

  it('treats negative max as zero', () => {
    expect(truncate('abc', -1)).toBe('…');
  });

  it('truncates unicode by code points', () => {
    expect(truncate('\u{1F600}\u{1F600}\u{1F600}', 2)).toBe(
      '\u{1F600}\u{1F600}…',
    );
  });
});
