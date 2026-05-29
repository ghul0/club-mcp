import { z } from 'zod';
import { ok, err, validationError, type Result, type AppError } from '@hhc-mcp/core';

const StdioConfigSchema = z.object({
  baseUrl: z.string().url(),
});

export type StdioConfig = z.infer<typeof StdioConfigSchema>;

export const loadStdioConfig = (
  env: Readonly<Record<string, string | undefined>>,
): Result<StdioConfig, AppError> => {
  const baseUrl = env['HHC_BASE_URL'];
  if (baseUrl === undefined || baseUrl === '') {
    return err(validationError('HHC_BASE_URL is not set or empty'));
  }

  const parsed = StdioConfigSchema.safeParse({ baseUrl });
  if (!parsed.success) {
    return err(validationError('HHC_BASE_URL is not a valid URL'));
  }

  return ok(parsed.data);
};
