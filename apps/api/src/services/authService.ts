import type { Request, Response } from 'express';

export const AUTH_COOKIE_NAME = 'abasto_admin';

export interface AuthContext {
  kind: 'local-admin';
  subject: 'admin';
}

export function verifyAdminPassword(candidate: string | undefined): boolean {
  return Boolean(candidate) && candidate === process.env.ADMIN_PASSWORD;
}

export function setAdminSessionCookie(response: Response): void {
  response.cookie(AUTH_COOKIE_NAME, 'authenticated', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

export function clearAdminSessionCookie(response: Response): void {
  response.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
}

export function getAuthContext(request: Request): AuthContext | null {
  if (request.signedCookies?.[AUTH_COOKIE_NAME] === 'authenticated') {
    return {
      kind: 'local-admin',
      subject: 'admin'
    };
  }

  return null;
}
