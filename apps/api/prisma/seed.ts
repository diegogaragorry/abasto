import { PrismaClient, ProductCategory, ProductUnit, StoreType } from '@prisma/client';

const prisma = new PrismaClient();

type SeedProduct = {
  name: string;
  category: ProductCategory;
  baseUnit: ProductUnit;
  sizeValue: number;
  aliases?: string[];
};

const products: SeedProduct[] = [
  {
    name: 'huevos colorados',
    category: ProductCategory.CARNES,
    baseUnit: ProductUnit.UNIT,
    sizeValue: 1,
    aliases: ['maple x30 oferta', 'maple x30 grandes', 'colorados x6', 'colorados x12', 'colorados x15']
  },
  { name: 'milanesa carne 1kg', category: ProductCategory.CARNES, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'milanesa pollo 1kg', category: ProductCategory.CARNES, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'salmon 1kg', category: ProductCategory.CARNES, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'yogurt integral 500g', category: ProductCategory.LACTEOS, baseUnit: ProductUnit.KG, sizeValue: 0.5 },
  { name: 'leche descremada 1l', category: ProductCategory.LACTEOS, baseUnit: ProductUnit.LITER, sizeValue: 1 },
  {
    name: 'banana',
    category: ProductCategory.FRUTAS,
    baseUnit: ProductUnit.KG,
    sizeValue: 1,
    aliases: ['banana brasil', 'banana brasil kilo', 'banana brasil kg', 'banana brasil k']
  },
  {
    name: 'palta hass',
    category: ProductCategory.FRUTAS,
    baseUnit: ProductUnit.UNIT,
    sizeValue: 1,
    aliases: ['palta', 'palta hass 2 un', 'palta hass unidad', 'palta hass c/u']
  },
  {
    name: 'manzana gala',
    category: ProductCategory.FRUTAS,
    baseUnit: ProductUnit.KG,
    sizeValue: 1,
    aliases: ['manzana gala 2kg', 'manzana gala kg']
  },
  {
    name: 'uva moscatel',
    category: ProductCategory.FRUTAS,
    baseUnit: ProductUnit.KG,
    sizeValue: 1,
    aliases: ['uva moscatel 2 kilos', 'uva moscatel kg']
  },
  {
    name: 'melon',
    category: ProductCategory.FRUTAS,
    baseUnit: ProductUnit.KG,
    sizeValue: 1,
    aliases: ['melon cepi', 'melon kg']
  },
  {
    name: 'sandia',
    category: ProductCategory.FRUTAS,
    baseUnit: ProductUnit.KG,
    sizeValue: 1,
    aliases: ['sandia kg', 'sandia cortada', 'sandia cortada o entrera']
  },
  { name: 'pera', category: ProductCategory.FRUTAS, baseUnit: ProductUnit.KG, sizeValue: 1, aliases: ['pera nacional'] },
  { name: 'naranja', category: ProductCategory.FRUTAS, baseUnit: ProductUnit.KG, sizeValue: 1, aliases: ['naranja de mesa'] },
  { name: 'durazno', category: ProductCategory.FRUTAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'papa rosada', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1, aliases: ['papa rosada 3kg', 'papa rosada kg'] },
  { name: 'cebolla blanca', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'cebolla roja', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1, aliases: ['cebolla colorada'] },
  { name: 'zanahoria', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'calabacin', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'pepino', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'berenjena', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'zucchini', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1, aliases: ['zuccini'] },
  { name: 'zapallito', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1, aliases: ['zapallito express'] },
  { name: 'cherry perita', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'morron verde', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'tomate', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'lechuga mantecosa', category: ProductCategory.VERDURAS, baseUnit: ProductUnit.UNIT, sizeValue: 1 },
  { name: 'espinaca congelada', category: ProductCategory.CONGELADOS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'brocoli congelado', category: ProductCategory.CONGELADOS, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'avena 800g', category: ProductCategory.ALMACEN, baseUnit: ProductUnit.KG, sizeValue: 0.8 },
  { name: 'arroz integral 1kg', category: ProductCategory.ALMACEN, baseUnit: ProductUnit.KG, sizeValue: 1 },
  {
    name: 'arandanos',
    category: ProductCategory.FRUTAS,
    baseUnit: ProductUnit.UNIT,
    sizeValue: 1,
    aliases: ['arandano petaca', 'arandano importado pet', 'arandano importado pet 125 g']
  },
  { name: 'tirabuzones 500g', category: ProductCategory.ALMACEN, baseUnit: ProductUnit.KG, sizeValue: 0.5 },
  { name: 'harina integral 1kg', category: ProductCategory.ALMACEN, baseUnit: ProductUnit.KG, sizeValue: 1 },
  { name: 'harina comun 1kg', category: ProductCategory.ALMACEN, baseUnit: ProductUnit.KG, sizeValue: 1 }
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPackageDescriptor(value: string): string {
  return normalize(value).replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|gr|l|lt|ml)\b/g, '').replace(/\s+/g, ' ').trim();
}

function hasPackageDescriptor(value: string): boolean {
  return /\b\d+(?:[.,]\d+)?\s*(kg|g|gr|l|lt|ml)\b/i.test(value);
}

async function main() {
  await prisma.store.upsert({
    where: { name: 'PedidosYa' },
    update: { type: StoreType.DELIVERY },
    create: { name: 'PedidosYa', type: StoreType.DELIVERY }
  });

  await prisma.store.upsert({
    where: { name: 'DelCampo' },
    update: { type: StoreType.BUTCHER },
    create: { name: 'DelCampo', type: StoreType.BUTCHER }
  });

  const feriaStore = await prisma.store.upsert({
    where: { name: 'PuntoFrescoMaM' },
    update: { type: StoreType.FERIA },
    create: { name: 'PuntoFrescoMaM', type: StoreType.FERIA }
  });

  const legacyBaseBrand = await prisma.brand.findUnique({
    where: { name: 'abasto base' }
  });

  if (legacyBaseBrand) {
    await prisma.product.updateMany({
      where: { brandId: legacyBaseBrand.id },
      data: { brandId: null }
    });
  }

  const basket = await prisma.basket.upsert({
    where: { id: 1 },
    update: { name: 'canasta base abasto' },
    create: { id: 1, name: 'canasta base abasto' }
  });

  for (const productSeed of products) {
    const normalizedName = normalize(productSeed.name);
    const equivalentProducts = await prisma.product.findMany({
      where: {
        baseUnit: productSeed.baseUnit,
        sizeValue: productSeed.sizeValue
      },
      include: {
        brand: true
      }
    });

    const equivalentProduct =
      equivalentProducts.find((product) => product.name === normalizedName) ??
      equivalentProducts.find((product) => stripPackageDescriptor(product.name) === stripPackageDescriptor(normalizedName));

    const product = equivalentProduct
      ? await prisma.product.update({
          where: { id: equivalentProduct.id },
        data: {
          baseUnit: productSeed.baseUnit,
          category: productSeed.category,
          sizeValue: productSeed.sizeValue
        }
      })
      : await prisma.product.create({
        data: {
          name: normalizedName,
          brandId: null,
          baseUnit: productSeed.baseUnit,
          category: productSeed.category,
          sizeValue: productSeed.sizeValue
        }
      });

    await prisma.storeProduct.upsert({
      where: {
        storeId_productId: {
          storeId: feriaStore.id,
          productId: product.id
        }
      },
      update: {},
      create: {
        storeId: feriaStore.id,
        productId: product.id
      }
    });

    await prisma.basketItem.upsert({
      where: {
        basketId_productId: {
          basketId: basket.id,
          productId: product.id
        }
      },
      update: {},
      create: {
        basketId: basket.id,
        productId: product.id,
        weeklyQuantity: 0,
        biweeklyQuantity: 0,
        monthlyQuantity: productSeed.category === ProductCategory.ALMACEN || productSeed.category === ProductCategory.CONGELADOS ? 1 : 0
      }
    });

    for (const alias of productSeed.aliases ?? []) {
      const normalizedAlias = normalize(alias);

      await prisma.productAlias.upsert({
        where: { alias: normalizedAlias },
        update: { productId: product.id },
        create: {
          alias: normalizedAlias,
          productId: product.id
        }
      });
    }
  }

  await mergeEquivalentProducts();

  if (legacyBaseBrand) {
    const remainingProducts = await prisma.product.count({
      where: { brandId: legacyBaseBrand.id }
    });

    if (remainingProducts === 0) {
      await prisma.brand.delete({
        where: { id: legacyBaseBrand.id }
      });
    }
  }

  console.log('✅ Abasto base products seeded successfully');
}

async function mergeEquivalentProducts() {
  const productsWithRelations = await prisma.product.findMany({
    include: {
      brand: true,
      aliases: true,
      basketItems: true,
      prices: true,
      storeEntries: true
    },
    orderBy: { id: 'asc' }
  });

  const groupedProducts = new Map<string, typeof productsWithRelations>();

  for (const product of productsWithRelations) {
    const key = `${stripPackageDescriptor(product.name)}|${product.baseUnit}|${product.sizeValue}`;
    const group = groupedProducts.get(key) ?? [];
    group.push(product);
    groupedProducts.set(key, group);
  }

  for (const group of groupedProducts.values()) {
    if (group.length < 2) {
      continue;
    }

    const [canonical, ...duplicates] = group.sort((left, right) => {
      const leftScore = buildCanonicalScore(left);
      const rightScore = buildCanonicalScore(right);
      return rightScore - leftScore || left.id - right.id;
    });

    for (const duplicate of duplicates) {
      await mergeProductIntoCanonical(duplicate.id, canonical.id);
    }
  }
}

function buildCanonicalScore(product: {
  name: string;
  brandId: number | null;
  basketItems: Array<unknown>;
  prices: Array<unknown>;
}): number {
  let score = 0;

  if (product.brandId !== null) {
    score += 100;
  }

  if (!hasPackageDescriptor(product.name)) {
    score += 10;
  }

  score += product.prices.length * 3;
  score += product.basketItems.length * 2;

  return score;
}

async function mergeProductIntoCanonical(sourceProductId: number, targetProductId: number) {
  if (sourceProductId === targetProductId) {
    return;
  }

  const sourceProduct = await prisma.product.findUnique({
    where: { id: sourceProductId },
    include: {
      aliases: true,
      basketItems: true,
      storeEntries: true
    }
  });

  if (!sourceProduct) {
    return;
  }

  for (const alias of sourceProduct.aliases) {
    await prisma.productAlias.upsert({
      where: { alias: alias.alias },
      update: { productId: targetProductId },
      create: {
        alias: alias.alias,
        productId: targetProductId
      }
    });
  }

  for (const basketItem of sourceProduct.basketItems) {
    const existingBasketItem = await prisma.basketItem.findUnique({
      where: {
        basketId_productId: {
          basketId: basketItem.basketId,
          productId: targetProductId
        }
      }
    });

    if (!existingBasketItem) {
      await prisma.basketItem.create({
        data: {
          basketId: basketItem.basketId,
          productId: targetProductId,
          weeklyQuantity: basketItem.weeklyQuantity,
          biweeklyQuantity: basketItem.biweeklyQuantity,
          monthlyQuantity: basketItem.monthlyQuantity
        }
      });
    } else if (
      basketItem.weeklyQuantity > existingBasketItem.weeklyQuantity ||
      basketItem.biweeklyQuantity > existingBasketItem.biweeklyQuantity ||
      basketItem.monthlyQuantity > existingBasketItem.monthlyQuantity
    ) {
      await prisma.basketItem.update({
        where: { id: existingBasketItem.id },
        data: {
          weeklyQuantity: Math.max(existingBasketItem.weeklyQuantity, basketItem.weeklyQuantity),
          biweeklyQuantity: Math.max(existingBasketItem.biweeklyQuantity, basketItem.biweeklyQuantity),
          monthlyQuantity: Math.max(existingBasketItem.monthlyQuantity, basketItem.monthlyQuantity)
        }
      });
    }
  }

  for (const storeEntry of sourceProduct.storeEntries) {
    const targetStoreProduct = await prisma.storeProduct.upsert({
      where: {
        storeId_productId: {
          storeId: storeEntry.storeId,
          productId: targetProductId
        }
      },
      update: {},
      create: {
        storeId: storeEntry.storeId,
        productId: targetProductId
      }
    });

    await prisma.price.updateMany({
      where: {
        productId: sourceProductId,
        storeProductId: storeEntry.id
      },
      data: {
        productId: targetProductId,
        storeProductId: targetStoreProduct.id
      }
    });
  }

  await prisma.product.delete({
    where: { id: sourceProductId }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
