import { type Result, type AppError } from '@hhc-mcp/core';

export type ToolContent = { readonly type: 'text'; readonly text: string };

export type ToolResult = {
  readonly content: readonly ToolContent[];
  readonly isError?: boolean;
  readonly structuredContent?: Readonly<Record<string, unknown>>;
};

type ErrorEnvelope = {
  readonly code: AppError['code'];
  readonly message: string;
  readonly retryable: boolean;
  readonly correlation_id?: string;
};

const buildErrorEnvelope = (error: AppError): ErrorEnvelope =>
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

export const mapResultToTool = <T>(
  result: Result<T, AppError>,
  successFormatter?: (value: T) => readonly ToolContent[],
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
  const content = successFormatter
    ? successFormatter(value)
    : [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }];
  return {
    content,
    structuredContent: { result: value },
  };
};
