import { ProductCategory, ProductUnit } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { createProduct, deleteProduct, listProductPriceHistory, listProducts, updateProduct } from '../services/productService';

const updateProductSchema = z.object({
  name: z.string().min(1),
  brandName: z.string().trim().min(1).nullable(),
  unit: z.nativeEnum(ProductUnit),
  category: z.nativeEnum(ProductCategory)
});
const createProductSchema = updateProductSchema;

export async function listProductsController(_request: Request, response: Response): Promise<void> {
  const products = await listProducts();
  response.json(products);
}

export async function listProductPriceHistoryController(request: Request, response: Response): Promise<void> {
  const rawProductId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const productId = Number.parseInt(rawProductId, 10);

  if (Number.isNaN(productId)) {
    response.status(400).json({ error: 'INVALID_PRODUCT_ID' });
    return;
  }

  const prices = await listProductPriceHistory(productId);

  if (!prices) {
    response.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    return;
  }

  response.json(prices);
}

export async function updateProductController(request: Request, response: Response): Promise<void> {
  const rawProductId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const productId = Number.parseInt(rawProductId, 10);

  if (Number.isNaN(productId)) {
    response.status(400).json({ error: 'INVALID_PRODUCT_ID' });
    return;
  }

  const parsedBody = updateProductSchema.safeParse(request.body);

  if (!parsedBody.success) {
    response.status(400).json({ error: 'INVALID_BODY' });
    return;
  }

  const updatedProduct = await updateProduct(productId, parsedBody.data);

  if (!updatedProduct) {
    response.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    return;
  }

  response.json(updatedProduct);
}

export async function createProductController(request: Request, response: Response): Promise<void> {
  const parsedBody = createProductSchema.safeParse(request.body);

  if (!parsedBody.success) {
    response.status(400).json({ error: 'INVALID_BODY' });
    return;
  }

  try {
    const createdProduct = await createProduct(parsedBody.data);
    response.status(201).json(createdProduct);
  } catch (error) {
    if (error instanceof Error && error.message === 'PRODUCT_ALREADY_EXISTS') {
      response.status(409).json({ error: 'PRODUCT_ALREADY_EXISTS' });
      return;
    }

    throw error;
  }
}

export async function deleteProductController(request: Request, response: Response): Promise<void> {
  const rawProductId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const productId = Number.parseInt(rawProductId, 10);

  if (Number.isNaN(productId)) {
    response.status(400).json({ error: 'INVALID_PRODUCT_ID' });
    return;
  }

  const deleted = await deleteProduct(productId);

  if (!deleted) {
    response.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    return;
  }

  response.status(204).end();
}
