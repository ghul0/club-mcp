import {
  type Result,
  type AppError,
  type PublicAppErrorEnvelope as PublicEnvelopeType,
  PublicAppErrorEnvelope,
  redactKeys,
} from '@hhc-mcp/core';

export type ToolContent = { readonly type: 'text'; readonly text: string };

export type ToolResult = {
  readonly content: readonly ToolContent[];
  readonly isError?: boolean;
  readonly structuredContent?: Readonly<Record<string, unknown>>;
};

const buildErrorEnvelope = (error: AppError): PublicEnvelopeType => {
  const candidate =
    error.correlation_id !== undefined
      ? {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          correlation_id: error.correlation_id,
        }
      : {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        };

  const parsed = PublicAppErrorEnvelope.safeParse(candidate);
  if (!parsed.success) {
    return {
      code: 'external_service',
      message: 'internal error envelope validation failed',
      retryable: false,
    };
  }
  return parsed.data;
};

export const mapResultToTool = <T>(
  result: Result<T, AppError>,
  successFormatter?: (value: T) => readonly ToolContent[],
  successRedactor?: (value: T) => T,
): ToolResult => {
  if (!result.ok) {
    const error = result.error;
    const errorEnvelope = buildErrorEnvelope(error);
    return {
      isError: true,
      content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
      structuredContent: { error: errorEnvelope },
    };
  }
  const value = result.value;
  const sanitized = successRedactor ? successRedactor(value) : redactKeys(value);
  const content = successFormatter
    ? successFormatter(sanitized)
    : [{ type: 'text' as const, text: JSON.stringify(sanitized, null, 2) }];
  return {
    content,
    structuredContent: { result: sanitized },
  };
};
