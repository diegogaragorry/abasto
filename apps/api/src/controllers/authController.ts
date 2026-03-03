import type { Request, Response } from 'express';
import { z } from 'zod';
import { clearAdminSessionCookie, getAuthContext, setAdminSessionCookie, verifyAdminPassword } from '../services/authService';

const loginSchema = z.object({
  password: z.string().min(1)
});

export function loginController(request: Request, response: Response): void {
  const parsedBody = loginSchema.safeParse(request.body);

  if (!parsedBody.success) {
    response.status(400).json({ error: 'INVALID_BODY' });
    return;
  }

  if (!verifyAdminPassword(parsedBody.data.password)) {
    response.status(401).json({ error: 'INVALID_CREDENTIALS' });
    return;
  }

  setAdminSessionCookie(response);
  response.json({ ok: true });
}

export function logoutController(_request: Request, response: Response): void {
  clearAdminSessionCookie(response);
  response.status(204).send();
}

export function sessionController(request: Request, response: Response): void {
  response.json({
    authenticated: Boolean(getAuthContext(request))
  });
}
