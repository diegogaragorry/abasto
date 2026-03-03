import type { Request, Response } from 'express';
import { z } from 'zod';
import { listStores, updateStoreShippingCost } from '../services/storeService';

const updateStoreSchema = z.object({
  shippingCost: z.number().nonnegative()
});

export async function listStoresController(_request: Request, response: Response): Promise<void> {
  const stores = await listStores();
  response.json(stores);
}

export async function updateStoreController(request: Request, response: Response): Promise<void> {
  const rawStoreId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const storeId = Number.parseInt(rawStoreId, 10);

  if (Number.isNaN(storeId)) {
    response.status(400).json({ error: 'INVALID_STORE_ID' });
    return;
  }

  const parsedBody = updateStoreSchema.safeParse(request.body);
  if (!parsedBody.success) {
    response.status(400).json({ error: 'INVALID_BODY' });
    return;
  }

  const store = await updateStoreShippingCost(storeId, parsedBody.data.shippingCost);
  if (!store) {
    response.status(404).json({ error: 'STORE_NOT_FOUND' });
    return;
  }

  response.json(store);
}
