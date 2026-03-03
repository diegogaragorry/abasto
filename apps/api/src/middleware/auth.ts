import type { NextFunction, Request, Response } from 'express';
import { getAuthContext } from '../services/authService';

export function requireAdminSession(request: Request, response: Response, next: NextFunction): void {
  const authContext = getAuthContext(request);

  if (!authContext) {
    response.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  response.locals.auth = authContext;
  next();
}
