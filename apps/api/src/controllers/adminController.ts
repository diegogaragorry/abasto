import type { Request, Response } from 'express';
import { z } from 'zod';
import { listPriceBatches, importFeriaPdf } from '../services/feriaService';
import { getPedidosYaSession, updatePedidosYaSession } from '../services/pedidosyaSession';
import { getStoreSyncJob, startStoreSyncJob } from '../services/storeSyncJobs';

const pedidosYaSessionSchema = z.object({
  cookieText: z.string(),
  userAgent: z.string().trim().optional().nullable()
});

export async function uploadFeriaPdfController(request: Request, response: Response): Promise<void> {
  if (!request.file) {
    response.status(400).json({ error: 'FILE_REQUIRED' });
    return;
  }

  const summary = await importFeriaPdf(request.file.buffer);
  response.status(201).json(summary);
}

export async function listBatchHistoryController(_request: Request, response: Response): Promise<void> {
  const batches = await listPriceBatches();
  response.json(batches);
}

export async function getTataSyncStatusController(_request: Request, response: Response): Promise<void> {
  response.json(getStoreSyncJob('tata'));
}

export async function syncTataPricesController(_request: Request, response: Response): Promise<void> {
  response.status(202).json(startStoreSyncJob('tata'));
}

export async function getDiscoSyncStatusController(_request: Request, response: Response): Promise<void> {
  response.json(getStoreSyncJob('disco'));
}

export async function syncDiscoPricesController(_request: Request, response: Response): Promise<void> {
  response.status(202).json(startStoreSyncJob('disco'));
}

export async function getPedidosYaSyncStatusController(_request: Request, response: Response): Promise<void> {
  response.json(getStoreSyncJob('pedidosya'));
}

export async function syncPedidosYaPricesController(_request: Request, response: Response): Promise<void> {
  response.status(202).json(startStoreSyncJob('pedidosya'));
}

export async function getPedidosYaSessionController(_request: Request, response: Response): Promise<void> {
  const session = getPedidosYaSession();
  response.json({
    hasCookie: session.cookieHeader.length > 0,
    userAgent: session.userAgent,
    source: session.source,
    updatedAt: session.updatedAt,
    lastAutoRefreshAt: session.lastAutoRefreshAt,
    lastAutoRefreshError: session.lastAutoRefreshError
  });
}

export async function updatePedidosYaSessionController(request: Request, response: Response): Promise<void> {
  const parsed = pedidosYaSessionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'INVALID_BODY' });
    return;
  }

  const session = updatePedidosYaSession(parsed.data);
  response.json({
    hasCookie: session.cookieHeader.length > 0,
    userAgent: session.userAgent,
    source: session.source,
    updatedAt: session.updatedAt,
    lastAutoRefreshAt: session.lastAutoRefreshAt,
    lastAutoRefreshError: session.lastAutoRefreshError
  });
}
