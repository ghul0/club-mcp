import { describe, expect, it } from 'vitest';
import { ok, err, validationError, rateLimit, externalService } from '@hhc-mcp/core';
import { mapResultToTool, type ToolContent } from '../src/error-mapper.js';

describe('mapResultToTool', () => {
  it('maps ok result to text content and structuredContent.result', () => {
    const value = { foo: 1 };
    const result = mapResultToTool(ok(value));

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify(value, null, 2) });
    expect(result.structuredContent).toEqual({ result: value });
  });

  it('maps validation error to isError with envelope', () => {
    const error = validationError('bad input');
    const result = mapResultToTool(err(error));

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'validation: bad input' }]);
    expect(result.structuredContent).toEqual({
      error: {
        code: 'validation',
        message: 'bad input',
        retryable: false,
      },
    });
  });

  it('preserves retryable=true for rate_limit errors', () => {
    const error = rateLimit('slow down');
    const result = mapResultToTool(err(error));

    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error: { retryable: boolean; code: string } };
    expect(structured.error.retryable).toBe(true);
    expect(structured.error.code).toBe('rate_limit');
  });

  it('propagates correlation_id when present on error', () => {
    const error = externalService('upstream down', { correlation_id: 'corr-abc-123' });
    const result = mapResultToTool(err(error));

    const structured = result.structuredContent as { error: { correlation_id?: string } };
    expect(structured.error.correlation_id).toBe('corr-abc-123');
  });

  it('omits correlation_id when not provided on error', () => {
    const error = validationError('no correlation');
    const result = mapResultToTool(err(error));

    const structured = result.structuredContent as { error: Record<string, unknown> };
    expect('correlation_id' in structured.error).toBe(false);
  });

  it('never serializes cause field into structuredContent.error', () => {
    const cause = new Error('secret-bearing internal cause');
    const error = externalService('upstream failed', { correlation_id: 'corr-x', cause });
    const result = mapResultToTool(err(error));

    const structured = result.structuredContent as { error: Record<string, unknown> };
    expect('cause' in structured.error).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret-bearing internal cause');
  });

  it('respects custom successFormatter', () => {
    const value = { items: ['a', 'b'] };
    const formatter = (v: typeof value): readonly ToolContent[] => [
      { type: 'text', text: `items: ${v.items.join(',')}` },
    ];
    const result = mapResultToTool(ok(value), formatter);

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: 'items: a,b' }]);
    expect(result.structuredContent).toEqual({ result: value });
  });
});
