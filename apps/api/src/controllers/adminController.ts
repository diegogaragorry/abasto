import type { Request, Response } from 'express';
import { z } from 'zod';
import { listPriceBatches, importFeriaPdf } from '../services/feriaService';
import { persistPedidosYaBrowserResults } from '../connectors/pedidosya.connector';
import { getPedidosYaSession, updatePedidosYaSession } from '../services/pedidosyaSession';
import { getStoreSyncJob, startStoreSyncJob } from '../services/storeSyncJobs';

const pedidosYaSessionSchema = z.object({
  cookieText: z.string(),
  userAgent: z.string().trim().optional().nullable(),
  requestText: z.string().optional().nullable()
});

const pedidosYaBrowserSyncSchema = z.object({
  results: z.array(
    z.object({
      query: z.string(),
      candidates: z.array(
        z.object({
          name: z.string().optional(),
          price: z.number().optional(),
          price_per_measurement_unit: z.number().optional(),
          content_quantity: z.number().optional(),
          measurement_unit: z
            .object({
              short_name: z.string().optional()
            })
            .nullable()
            .optional()
        })
      )
    })
  )
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
    hasSearchTemplate: session.searchTemplateSource !== 'default',
    searchUrl: session.searchUrl,
    searchReferer: session.searchReferer,
    searchTemplateSource: session.searchTemplateSource,
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
    hasSearchTemplate: session.searchTemplateSource !== 'default',
    searchUrl: session.searchUrl,
    searchReferer: session.searchReferer,
    searchTemplateSource: session.searchTemplateSource,
    userAgent: session.userAgent,
    source: session.source,
    updatedAt: session.updatedAt,
    lastAutoRefreshAt: session.lastAutoRefreshAt,
    lastAutoRefreshError: session.lastAutoRefreshError
  });
}

export async function persistPedidosYaBrowserSyncController(request: Request, response: Response): Promise<void> {
  const parsed = pedidosYaBrowserSyncSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'INVALID_BODY' });
    return;
  }

  const summary = await persistPedidosYaBrowserResults(parsed.data.results);
  response.json(summary);
}
