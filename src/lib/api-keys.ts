import { randomBytes, createHash } from 'crypto';

const API_KEY_PREFIX = 'b0t_';

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const rawKey = randomBytes(32).toString('base64url');
  const key = `${API_KEY_PREFIX}${rawKey}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 12); // "b0t_XXXXXXXX" for identification
  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
