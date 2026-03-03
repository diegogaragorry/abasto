import type { StoreOverview, StoreRecentPrice } from '@abasto/shared';
import { decodeMojibake } from '../normalizers/text';
import { prisma } from './prisma';

export async function listStores(): Promise<StoreOverview[]> {
  const stores = await prisma.store.findMany({
    orderBy: { name: 'asc' },
    include: {
      storeEntries: {
        include: {
          product: true,
          prices: {
            orderBy: { capturedAt: 'desc' },
            take: 1
          }
        }
      }
    }
  });

  return stores.map((store) => {
    const recentPrices: StoreRecentPrice[] = store.storeEntries
      .flatMap((storeEntry) =>
        storeEntry.prices.map((price) => ({
          productId: storeEntry.product.id,
          productName: storeEntry.product.name,
          price: price.price,
          normalizedPrice:
            price.pricePerKg ?? price.pricePerLiter ?? price.pricePerUnit ?? (storeEntry.product.sizeValue > 0 ? price.price / storeEntry.product.sizeValue : null),
          normalizedUnit: (price.pricePerKg ? 'kg' : price.pricePerLiter ? 'l' : price.pricePerUnit ? 'unidad' : null) as StoreRecentPrice['normalizedUnit'],
          sourceLabel: price.sourceLabel ? decodeMojibake(price.sourceLabel) : null,
          capturedAt: price.capturedAt.toISOString()
        }))
      )
      .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime())
      .slice(0, 8);

    return {
      id: store.id,
      name: store.name,
      type: store.type,
      shippingCost: store.shippingCost,
      latestUpdateAt: recentPrices[0]?.capturedAt ?? null,
      recentPrices
    };
  }).filter((store) => !(store.name === 'PedidosYa' && store.recentPrices.length === 0));
}

export async function updateStoreShippingCost(storeId: number, shippingCost: number): Promise<StoreOverview | null> {
  const store = await prisma.store.findUnique({
    where: { id: storeId }
  });

  if (!store) {
    return null;
  }

  await prisma.store.update({
    where: { id: storeId },
    data: { shippingCost }
  });

  const stores = await listStores();
  return stores.find((item) => item.id === storeId) ?? null;
}
