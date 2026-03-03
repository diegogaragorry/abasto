import type { Request, Response } from 'express';
import { z } from 'zod';
import { calculateBasketById, calculateDefaultBasket, getDefaultBasket, replaceDefaultBasketItems } from '../services/basketService';

const basketItemsSchema = z.array(
  z.object({
    productId: z.number().int().positive(),
    weeklyQuantity: z.number().nonnegative(),
    biweeklyQuantity: z.number().nonnegative(),
    monthlyQuantity: z.number().nonnegative()
  })
);

export async function calculateBasketController(request: Request, response: Response): Promise<void> {
  const rawBasketId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const basketId = Number.parseInt(rawBasketId, 10);

  if (Number.isNaN(basketId)) {
    response.status(400).json({ error: 'INVALID_BASKET_ID' });
    return;
  }

  const result = await calculateBasketById(basketId);

  if (!result) {
    response.status(404).json({ error: 'BASKET_NOT_FOUND' });
    return;
  }

  response.json(result);
}

export async function getBasketController(_request: Request, response: Response): Promise<void> {
  const basket = await getDefaultBasket();
  response.json(basket);
}

export async function upsertBasketController(request: Request, response: Response): Promise<void> {
  const parsedBody = basketItemsSchema.safeParse(request.body);

  if (!parsedBody.success) {
    response.status(400).json({ error: 'INVALID_BASKET_PAYLOAD' });
    return;
  }

  try {
    const basket = await replaceDefaultBasketItems(parsedBody.data);
    response.json(basket);
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PRODUCT_IDS') {
      response.status(400).json({ error: 'INVALID_PRODUCT_IDS' });
      return;
    }

    throw error;
  }
}

export async function calculateDefaultBasketController(_request: Request, response: Response): Promise<void> {
  const result = await calculateDefaultBasket();
  response.json(result);
}
