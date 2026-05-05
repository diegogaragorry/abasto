import { randomUUID } from 'node:crypto';

const TOKEN_TTL_MS = 20 * 60 * 1000;

type BrowserSyncTokenRecord = {
  expiresAt: number;
};

const tokens = new Map<string, BrowserSyncTokenRecord>();

export function createPedidosYaBrowserSyncToken(): { token: string; expiresAt: string } {
  cleanupExpiredTokens();

  const token = randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, { expiresAt });

  return {
    token,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

export function validatePedidosYaBrowserSyncToken(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }

  cleanupExpiredTokens();
  const record = tokens.get(token);
  return Boolean(record && record.expiresAt > Date.now());
}

export function getPedidosYaBrowserSyncTokenExpiresAt(token: string | null | undefined): string | null {
  if (!validatePedidosYaBrowserSyncToken(token)) {
    return null;
  }

  const record = tokens.get(token as string);
  return record ? new Date(record.expiresAt).toISOString() : null;
}

export function consumePedidosYaBrowserSyncToken(token: string | null | undefined): boolean {
  if (!validatePedidosYaBrowserSyncToken(token)) {
    return false;
  }

  tokens.delete(token as string);
  return true;
}

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, record] of tokens.entries()) {
    if (record.expiresAt <= now) {
      tokens.delete(token);
    }
  }
}
