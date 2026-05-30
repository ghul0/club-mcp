import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const AuthFileSchema = z.object({
  base_url: z.string().optional(),
  cookie: z.string().optional(),
  nonce: z.string().optional(),
  nonce_refreshed_at: z.string().optional(),
  user: z.string().optional(),
  app_pass: z.string().optional(),
});

export type AuthFileData = z.infer<typeof AuthFileSchema>;

export interface AuthFileStore {
  read: () => AuthFileData;
  setNonce: (nonce: string) => void;
}

export const createAuthFileStore = (path: string): AuthFileStore => {
  const readRaw = (): Record<string, unknown> => {
    if (!existsSync(path)) {
      return {};
    }
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return {};
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return {};
    }
    return data as Record<string, unknown>;
  };

  const read = (): AuthFileData => {
    const parsed = AuthFileSchema.safeParse(readRaw());
    return parsed.success ? parsed.data : {};
  };

  const resolveTarget = (): string => {
    try {
      return realpathSync(path);
    } catch {
      return path;
    }
  };

  const removeQuietly = (p: string): void => {
    try {
      unlinkSync(p);
    } catch (cleanupError) {
      void cleanupError;
    }
  };

  const setNonce = (nonce: string): void => {
    const next: Record<string, unknown> = {
      ...readRaw(),
      nonce,
      nonce_refreshed_at: new Date().toISOString(),
    };
    const target = resolveTarget();
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, target);
    } catch (error) {
      removeQuietly(tmp);
      throw error;
    }
  };

  return { read, setNonce };
};
