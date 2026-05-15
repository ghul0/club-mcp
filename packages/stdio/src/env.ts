import { z } from 'zod';
import { ok, err, validationError, type Result, type AppError } from '@hhc-mcp/core';

const StdioConfigSchema = z.object({
  baseUrl: z.string().url(),
  user: z.string().min(1),
  appPass: z.string().min(1),
});

export type StdioConfig = z.infer<typeof StdioConfigSchema>;

export const loadStdioConfig = (
  env: Readonly<Record<string, string | undefined>>,
): Result<StdioConfig, AppError> => {
  const baseUrl = env['HHC_BASE_URL'];
  if (baseUrl === undefined || baseUrl === '') {
    return err(validationError('HHC_BASE_URL is not set or empty'));
  }

  const user = env['HHC_USER'];
  if (user === undefined || user === '') {
    return err(validationError('HHC_USER is not set or empty'));
  }

  const appPass = env['HHC_APP_PASS'];
  if (appPass === undefined || appPass === '') {
    return err(validationError('HHC_APP_PASS is not set or empty'));
  }

  const parsed = StdioConfigSchema.safeParse({ baseUrl, user, appPass });
  if (!parsed.success) {
    return err(validationError('HHC_BASE_URL is not a valid URL'));
  }

  return ok(parsed.data);
};
