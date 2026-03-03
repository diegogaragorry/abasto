import type { BasketCalculationResult, BasketItemInput, BasketSummary } from '@abasto/shared';
import { prisma } from './prisma';

const DEFAULT_BASKET_ID = 1;
const DEFAULT_BASKET_NAME = 'canasta base abasto';

export async function calculateBasketById(basketId: number): Promise<BasketCalculationResult | null> {
  const basket = await prisma.basket.findUnique({
    where: { id: basketId },
    include: {
      items: {
        include: {
          product: true
        }
      }
    }
  });

  if (!basket) {
    return null;
  }

  let totalCost = 0;
  const storeBreakdown: Record<string, number> = {};
  const shippingBreakdown: Record<string, number> = {};
  const itemBreakdown: BasketCalculationResult['itemBreakdown'] = [];
  const storePlans = new Map<
    string,
    {
      storeName: string;
      shippingCost: number;
      totalProductCost: number;
      weekly: BasketCalculationResult['storePlans'][number]['weekly'];
      biweekly: BasketCalculationResult['storePlans'][number]['biweekly'];
      monthly: BasketCalculationResult['storePlans'][number]['monthly'];
    }
  >();

  for (const item of basket.items) {
    const monthlyEquivalentQuantity = getMonthlyEquivalentQuantity(item.weeklyQuantity, item.biweeklyQuantity, item.monthlyQuantity);
    if (monthlyEquivalentQuantity <= 0) {
      continue;
    }

    const prices = await prisma.price.findMany({
      where: { productId: item.productId },
      orderBy: [
        { storeProductId: 'asc' },
        { capturedAt: 'desc' }
      ],
      include: {
        storeProduct: {
          include: {
            store: true
          }
        }
      }
    });

    const latestByStore = new Map<number, (typeof prices)[number]>();

    for (const price of prices) {
      if (!latestByStore.has(price.storeProductId)) {
        latestByStore.set(price.storeProductId, price);
      }
    }

    const bestPrice = [...latestByStore.values()].reduce<(typeof prices)[number] | null>((best, current) => {
      const currentComparablePrice = getComparablePrice(current, item.product.baseUnit, item.product.sizeValue);
      if (currentComparablePrice === null) {
        return best;
      }

      if (!best) {
        return current;
      }

      const bestComparablePrice = getComparablePrice(best, item.product.baseUnit, item.product.sizeValue);
      if (bestComparablePrice === null || currentComparablePrice < bestComparablePrice) {
        return current;
      }

      return best;
    }, null);

    if (!bestPrice) {
      continue;
    }

    const comparablePrice = getComparablePrice(bestPrice, item.product.baseUnit, item.product.sizeValue);
    if (comparablePrice === null) {
      continue;
    }

    const cost = comparablePrice * monthlyEquivalentQuantity;
    totalCost += cost;
    storeBreakdown[bestPrice.storeProduct.store.name] =
      (storeBreakdown[bestPrice.storeProduct.store.name] ?? 0) + cost;

    const storePlan =
      storePlans.get(bestPrice.storeProduct.store.name) ??
      {
        storeName: bestPrice.storeProduct.store.name,
        shippingCost: bestPrice.storeProduct.store.shippingCost,
        totalProductCost: 0,
        weekly: [],
        biweekly: [],
        monthly: []
      };
    storePlan.totalProductCost += cost;
    pushStorePlanItems(storePlan, item.product.baseUnit, item.productId, item.product.name, comparablePrice, item.weeklyQuantity, item.biweeklyQuantity, item.monthlyQuantity);
    storePlans.set(bestPrice.storeProduct.store.name, storePlan);

    itemBreakdown.push({
      productId: item.productId,
      productName: item.product.name,
      storeName: bestPrice.storeProduct.store.name,
      weeklyQuantity: item.weeklyQuantity,
      biweeklyQuantity: item.biweeklyQuantity,
      monthlyQuantity: item.monthlyQuantity,
      monthlyEquivalentQuantity,
      unit: item.product.baseUnit,
      unitPrice: comparablePrice,
      totalCost: cost
    });
  }

  for (const storePlan of storePlans.values()) {
    const monthlyShippingCost =
      (storePlan.weekly.length > 0 ? storePlan.shippingCost * 4 : 0) +
      (storePlan.biweekly.length > 0 ? storePlan.shippingCost * 2 : 0) +
      (storePlan.monthly.length > 0 ? storePlan.shippingCost : 0);

    if (monthlyShippingCost > 0) {
      totalCost += monthlyShippingCost;
      shippingBreakdown[storePlan.storeName] = monthlyShippingCost;
      storeBreakdown[storePlan.storeName] = (storeBreakdown[storePlan.storeName] ?? 0) + monthlyShippingCost;
    }
  }

  return {
    totalCost,
    storeBreakdown,
    shippingBreakdown,
    itemBreakdown,
    storePlans: Array.from(storePlans.values())
      .map((storePlan) => {
        const monthlyShippingCost =
          (storePlan.weekly.length > 0 ? storePlan.shippingCost * 4 : 0) +
          (storePlan.biweekly.length > 0 ? storePlan.shippingCost * 2 : 0) +
          (storePlan.monthly.length > 0 ? storePlan.shippingCost : 0);

        return {
          storeName: storePlan.storeName,
          shippingCost: storePlan.shippingCost,
          monthlyShippingCost,
          totalProductCost: storePlan.totalProductCost,
          totalCost: storePlan.totalProductCost + monthlyShippingCost,
          weekly: storePlan.weekly,
          biweekly: storePlan.biweekly,
          monthly: storePlan.monthly
        };
      })
      .sort((left, right) => left.storeName.localeCompare(right.storeName))
  };
}

function getComparablePrice(
  price: {
    price: number;
    pricePerKg: number | null;
    pricePerLiter: number | null;
    pricePerUnit: number | null;
  },
  unit: 'KG' | 'UNIT' | 'LITER',
  sizeValue: number
): number | null {
  if (unit === 'KG') {
    return price.pricePerKg ?? fallbackPackagePrice(price.price, sizeValue);
  }

  if (unit === 'LITER') {
    return price.pricePerLiter ?? fallbackPackagePrice(price.price, sizeValue);
  }

  if (unit === 'UNIT') {
    return price.pricePerUnit ?? fallbackPackagePrice(price.price, sizeValue);
  }

  return price.price;
}

function fallbackPackagePrice(price: number, sizeValue: number): number {
  return sizeValue > 0 ? price / sizeValue : price;
}

export async function getDefaultBasket(): Promise<BasketSummary> {
  const basket = await prisma.basket.upsert({
    where: { id: DEFAULT_BASKET_ID },
    update: {},
    create: {
      id: DEFAULT_BASKET_ID,
      name: DEFAULT_BASKET_NAME
    },
    include: {
      items: {
        include: {
          product: true
        },
        orderBy: {
          product: {
            name: 'asc'
          }
        }
      }
    }
  });

  return {
    id: basket.id,
    name: basket.name,
      items: basket.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        category: item.product.category,
        unit: item.product.baseUnit,
        sizeValue: item.product.sizeValue,
        weeklyQuantity: item.weeklyQuantity,
        biweeklyQuantity: item.biweeklyQuantity,
        monthlyQuantity: item.monthlyQuantity
      }))
  };
}

export async function replaceDefaultBasketItems(items: BasketItemInput[]): Promise<BasketSummary> {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const existingProducts = await prisma.product.findMany({
    where: {
      id: {
        in: productIds
      }
    },
    select: {
      id: true
    }
  });

  if (existingProducts.length !== productIds.length) {
    throw new Error('INVALID_PRODUCT_IDS');
  }

  await prisma.basket.upsert({
    where: { id: DEFAULT_BASKET_ID },
    update: {},
    create: {
      id: DEFAULT_BASKET_ID,
      name: DEFAULT_BASKET_NAME
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.basketItem.deleteMany({
      where: { basketId: DEFAULT_BASKET_ID }
    });

    if (items.length > 0) {
      await tx.basketItem.createMany({
        data: items.map((item) => ({
          basketId: DEFAULT_BASKET_ID,
          productId: item.productId,
          weeklyQuantity: item.weeklyQuantity,
          biweeklyQuantity: item.biweeklyQuantity,
          monthlyQuantity: item.monthlyQuantity
        }))
      });
    }
  });

  return getDefaultBasket();
}

function getMonthlyEquivalentQuantity(weeklyQuantity: number, biweeklyQuantity: number, monthlyQuantity: number): number {
  return weeklyQuantity * 4 + biweeklyQuantity * 2 + monthlyQuantity;
}

export async function calculateDefaultBasket(): Promise<BasketCalculationResult> {
  const result = await calculateBasketById(DEFAULT_BASKET_ID);

  return (
    result ?? {
      totalCost: 0,
      storeBreakdown: {},
      shippingBreakdown: {},
      itemBreakdown: [],
      storePlans: []
    }
  );
}

function pushStorePlanItems(
  storePlan: {
    weekly: BasketCalculationResult['storePlans'][number]['weekly'];
    biweekly: BasketCalculationResult['storePlans'][number]['biweekly'];
    monthly: BasketCalculationResult['storePlans'][number]['monthly'];
  },
  unit: 'KG' | 'UNIT' | 'LITER',
  productId: number,
  productName: string,
  unitPrice: number,
  weeklyQuantity: number,
  biweeklyQuantity: number,
  monthlyQuantity: number
) {
  if (weeklyQuantity > 0) {
    storePlan.weekly.push({
      productId,
      productName,
      quantity: weeklyQuantity,
      unit,
      unitPrice,
      totalCost: weeklyQuantity * unitPrice * 4
    });
  }

  if (biweeklyQuantity > 0) {
    storePlan.biweekly.push({
      productId,
      productName,
      quantity: biweeklyQuantity,
      unit,
      unitPrice,
      totalCost: biweeklyQuantity * unitPrice * 2
    });
  }

  if (monthlyQuantity > 0) {
    storePlan.monthly.push({
      productId,
      productName,
      quantity: monthlyQuantity,
      unit,
      unitPrice,
      totalCost: monthlyQuantity * unitPrice
    });
  }
}
