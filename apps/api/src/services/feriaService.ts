import type { BatchSummary, UnmatchedItem } from '@abasto/shared';
import { PDFParse } from 'pdf-parse';
import { Prisma, StoreType } from '@prisma/client';
import { parseFeriaPdfText } from '../parsers/feriaPdfParser';
import { normalizeText } from '../normalizers/text';
import { prisma } from './prisma';

function buildUnmatchedItem(input: {
  raw: string;
  normalized: string;
  price: number;
  quantity: number;
  unit: string | null;
}): UnmatchedItem {
  return {
    raw: input.raw,
    normalized: input.normalized,
    price: input.price,
    quantity: input.quantity,
    unit: input.unit
  };
}

export async function importFeriaPdf(fileBuffer: Buffer): Promise<BatchSummary> {
  const feriaStore = await prisma.store.findFirst({
    where: {
      type: StoreType.FERIA,
      name: 'PuntoFrescoMaM'
    }
  });

  if (!feriaStore) {
    throw new Error('FERIA_STORE_NOT_CONFIGURED');
  }

  const batch = await prisma.priceBatch.create({
    data: {
      storeId: feriaStore.id
    }
  });

  const parser = new PDFParse({ data: fileBuffer });
  const parsedPdf = await parser.getText();
  await parser.destroy();
  console.log('---- PDF DEBUG ----');
  console.log('Text length:', parsedPdf.text.length);
  console.log('Preview:', parsedPdf.text.slice(0, 1000));
  console.log('-------------------');
  const parsedLines = parseFeriaPdfText(parsedPdf.text);
  const unmatched: UnmatchedItem[] = [];
  let importedCount = 0;

  for (const parsedLine of parsedLines) {
    const matchedProduct = await matchProduct(parsedLine.normalizedName);

    if (!matchedProduct) {
      unmatched.push(
        buildUnmatchedItem({
          raw: parsedLine.rawName,
          normalized: parsedLine.normalizedName,
          price: parsedLine.price,
          quantity: parsedLine.quantity,
          unit: parsedLine.unit
        })
      );
      continue;
    }

    const storeProduct = await prisma.storeProduct.upsert({
      where: {
        storeId_productId: {
          storeId: feriaStore.id,
          productId: matchedProduct.id
        }
      },
      update: {},
      create: {
        storeId: feriaStore.id,
        productId: matchedProduct.id
      }
    });

    await prisma.price.create({
      data: {
        batchId: batch.id,
        productId: matchedProduct.id,
        storeProductId: storeProduct.id,
        price: parsedLine.price,
        pricePerKg: isWeightUnit(parsedLine.unit) ? parsedLine.price / parsedLine.quantity : null,
        pricePerLiter: isLiterUnit(parsedLine.unit) ? parsedLine.price / parsedLine.quantity : null,
        pricePerUnit: isUnit(parsedLine.unit) ? parsedLine.price / parsedLine.quantity : null,
        sourceLabel: parsedLine.rawName
      }
    });

    importedCount += 1;
  }

  const updatedBatch = await prisma.priceBatch.update({
    where: { id: batch.id },
    data: {
      importedCount,
      unmatched: unmatched as unknown as Prisma.InputJsonValue
    }
  });

  return {
    batchId: updatedBatch.id,
    createdAt: updatedBatch.createdAt.toISOString(),
    storeName: feriaStore.name,
    importedCount: updatedBatch.importedCount,
    unmatched
  };
}

export async function listPriceBatches(): Promise<BatchSummary[]> {
  const batches = await prisma.priceBatch.findMany({
    orderBy: { createdAt: 'desc' },
    include: { store: true }
  });

  return batches.map((batch) => ({
    batchId: batch.id,
    createdAt: batch.createdAt.toISOString(),
    storeName: batch.store.name,
    importedCount: batch.importedCount,
    unmatched: ((batch.unmatched as UnmatchedItem[] | null) ?? []).map((item) => ({
      raw: item.raw,
      normalized: item.normalized,
      price: item.price,
      quantity: item.quantity,
      unit: item.unit
    }))
  }));
}

async function matchProduct(normalizedName: string) {
  const variants = buildMatchVariants(normalizeText(normalizedName));
  const directMatch = await prisma.product.findFirst({
    where: {
      name: { in: variants }
    }
  });

  if (directMatch) {
    return directMatch;
  }

  const alias = await prisma.productAlias.findFirst({
    where: {
      alias: { in: variants }
    },
    include: {
      product: true
    }
  });

  return alias?.product ?? null;
}

function buildMatchVariants(value: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  variants.add(normalized);
  variants.add(singularize(normalized));

  return Array.from(variants).filter(Boolean);
}

function singularize(value: string): string {
  if (value.endsWith('es') && value.length > 4) {
    return value.slice(0, -2);
  }

  if (value.endsWith('s') && value.length > 4) {
    return value.slice(0, -1);
  }

  return value;
}

function isWeightUnit(unit: string | null): boolean {
  return unit ? /^(kg|kilo|kilos|k)$/i.test(unit) : false;
}

function isUnit(unit: string | null): boolean {
  return unit ? /^(un|unidad|unidades)$/i.test(unit) : false;
}

function isLiterUnit(unit: string | null): boolean {
  return unit ? /^(lt|lts|litro|litros|l)$/i.test(unit) : false;
}
