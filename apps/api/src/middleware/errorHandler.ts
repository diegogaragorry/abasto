import type { NextFunction, Request, Response } from 'express';

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  console.error(error);

  if (isPayloadTooLargeError(error)) {
    response.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
    return;
  }

  response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
}

function isPayloadTooLargeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'entity.too.large'
  );
}
