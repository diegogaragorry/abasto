import type { ProductListItem, ProductPriceHistoryEntry, ProductUpdateInput } from '@abasto/shared';
import { Prisma } from '@prisma/client';
import { decodeMojibake } from '../normalizers/text';
import { prisma } from './prisma';

export async function listProducts(): Promise<ProductListItem[]> {
  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    include: {
      brand: true,
      storeEntries: {
        include: {
          store: true,
          prices: {
            orderBy: { capturedAt: 'desc' }
          }
        }
      }
    }
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    brandName: product.brand?.name ?? null,
    unit: product.baseUnit,
    category: product.category,
    sizeValue: product.sizeValue,
    latestPrices: product.storeEntries
      .map((storeEntry) => {
        const latestPrice = selectLatestDisplayPrice(product.name, storeEntry.store.name, storeEntry.prices);
        if (!latestPrice) {
          return null;
        }

        return {
          storeName: storeEntry.store.name,
          price: latestPrice.price,
          pricePerKg: resolveLatestPricePerKg(
            product.baseUnit,
            latestPrice.pricePerKg,
            latestPrice.price,
            latestPrice.sourceLabel
          ),
          pricePerLiter: resolveLatestPricePerLiter(
            product.baseUnit,
            latestPrice.pricePerLiter,
            latestPrice.price,
            latestPrice.sourceLabel
          ),
          pricePerUnit: resolveLatestPricePerUnit(
            product.name,
            storeEntry.store.name,
            latestPrice.pricePerUnit,
            latestPrice.price,
            latestPrice.sourceLabel
          ),
          sourceLabel: resolveLatestSourceLabel(product.name, storeEntry.store.name, latestPrice.sourceLabel, latestPrice.price),
          capturedAt: latestPrice.capturedAt.toISOString()
        };
      })
      .filter((price): price is NonNullable<typeof price> => price !== null)
  }));
}

export async function listProductPriceHistory(productId: number): Promise<ProductPriceHistoryEntry[] | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product) {
    return null;
  }

  const prices = await prisma.price.findMany({
    where: { productId },
    orderBy: { capturedAt: 'desc' },
    include: {
      storeProduct: {
        include: {
          store: true
        }
      }
    }
  });

  return prices.map((price) => ({
    id: price.id,
    storeName: price.storeProduct.store.name,
    price: price.price,
    pricePerKg: price.pricePerKg,
    pricePerLiter: price.pricePerLiter,
    pricePerUnit: price.pricePerUnit,
    sourceLabel: price.sourceLabel ? decodeMojibake(price.sourceLabel) : null,
    capturedAt: price.capturedAt.toISOString()
  }));
}

export async function updateProduct(
  productId: number,
  input: ProductUpdateInput
): Promise<ProductListItem | null> {
  const normalizedName = normalizeCatalogValue(input.name);
  const normalizedBrandName = normalizeOptionalCatalogValue(input.brandName);

  const existingProduct = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!existingProduct) {
    return null;
  }

  let brandId: number | null = null;

  if (normalizedBrandName) {
    const brand = await prisma.brand.upsert({
      where: { name: normalizedBrandName },
      update: {},
      create: { name: normalizedBrandName }
    });

    brandId = brand.id;
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      name: normalizedName,
      brandId,
      baseUnit: input.unit,
      category: input.category
    }
  });

  const refreshedProducts = await listProducts();
  return refreshedProducts.find((product) => product.id === productId) ?? null;
}

export async function createProduct(input: ProductUpdateInput): Promise<ProductListItem> {
  const normalizedName = normalizeCatalogValue(input.name);
  const normalizedBrandName = normalizeOptionalCatalogValue(input.brandName);
  let brandId: number | null = null;

  if (normalizedBrandName) {
    const brand = await prisma.brand.upsert({
      where: { name: normalizedBrandName },
      update: {},
      create: { name: normalizedBrandName }
    });

    brandId = brand.id;
  }

  try {
    const createdProduct = await prisma.product.create({
      data: {
        name: normalizedName,
        brandId,
        baseUnit: input.unit,
        category: input.category,
        sizeValue: 1
      }
    });

    const refreshedProducts = await listProducts();
    return refreshedProducts.find((product) => product.id === createdProduct.id) as ProductListItem;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('PRODUCT_ALREADY_EXISTS');
    }

    throw error;
  }
}

export async function deleteProduct(productId: number): Promise<boolean> {
  const existingProduct = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!existingProduct) {
    return false;
  }

  await prisma.product.delete({
    where: { id: productId }
  });

  return true;
}

function normalizeCatalogValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOptionalCatalogValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = normalizeCatalogValue(value);
  return normalized.length > 0 ? normalized : null;
}

function selectLatestDisplayPrice(
  productName: string,
  storeName: string,
  prices: Array<{
    price: number;
    pricePerKg: number | null;
    pricePerLiter: number | null;
    pricePerUnit: number | null;
    sourceLabel: string | null;
    capturedAt: Date;
  }>
) {
  if (storeName === 'PedidosYaMarket') {
    const validPedidosYaPrice = prices.find((price) => isValidPedidosYaDisplayPrice(productName, price.sourceLabel));
    if (!validPedidosYaPrice) {
      return null;
    }

    return validPedidosYaPrice;
  }

  if (storeName === 'Disco') {
    const validDiscoPrice = prices.find((price) => isValidDiscoDisplayPrice(productName, price.sourceLabel));
    if (!validDiscoPrice) {
      return null;
    }

    return validDiscoPrice;
  }

  if (productName !== 'huevos colorados') {
    return prices[0] ?? null;
  }

  const preferredPackageCount =
    storeName === 'PedidosYaMarket' ? 15 : storeName === 'Tata' || storeName === 'PuntoFrescoMaM' ? 30 : null;

  if (preferredPackageCount === null) {
    return prices[0] ?? null;
  }

  return (
    prices.find((price) => extractPackageCount(price.sourceLabel) === preferredPackageCount) ??
    prices[0] ??
    null
  );
}

function resolveLatestPricePerKg(
  baseUnit: ProductListItem['unit'],
  pricePerKg: number | null,
  price: number,
  sourceLabel: string | null
): number | null {
  const packageSize = extractPackageSize(sourceLabel);
  if (packageSize?.unit === 'KG') {
    return price / packageSize.value;
  }

  if (pricePerKg !== null) {
    return pricePerKg;
  }

  return baseUnit === 'KG' ? price : null;
}

function resolveLatestPricePerLiter(
  baseUnit: ProductListItem['unit'],
  pricePerLiter: number | null,
  price: number,
  sourceLabel: string | null
): number | null {
  const packageSize = extractPackageSize(sourceLabel);
  if (packageSize?.unit === 'LITER') {
    return price / packageSize.value;
  }

  if (pricePerLiter !== null) {
    return pricePerLiter;
  }

  return baseUnit === 'LITER' ? price : null;
}

function resolveLatestPricePerUnit(
  productName: string,
  storeName: string,
  pricePerUnit: number | null,
  price: number,
  sourceLabel: string | null
): number | null {
  const packageCount = extractPackageCount(sourceLabel);
  if (packageCount && packageCount > 0) {
    return price / packageCount;
  }

  if (pricePerUnit !== null) {
    return pricePerUnit;
  }

  if (productName === 'huevos colorados' && storeName === 'PuntoFrescoMaM') {
    return price / 30;
  }

  if (productName === 'arandanos' && storeName === 'PuntoFrescoMaM') {
    return price;
  }

  if (productName === 'arandanos' && isBlueberryPackLabel(sourceLabel)) {
    return price;
  }

  return null;
}

function resolveLatestSourceLabel(
  productName: string,
  storeName: string,
  sourceLabel: string | null,
  price: number
): string | null {
  if (sourceLabel) {
    return decodeMojibake(sourceLabel);
  }

  if (productName === 'huevos colorados' && storeName === 'PuntoFrescoMaM') {
    return `Maple 30 huevos - ${formatMoney(price)} pesos`;
  }

  if (productName === 'arandanos' && storeName === 'PuntoFrescoMaM') {
    return `Petaca 125 g - ${formatMoney(price)} pesos`;
  }

  if (storeName === 'PuntoFrescoMaM') {
    return `${formatProductLabel(productName)} - ${formatMoney(price)} pesos`;
  }

  return null;
}

function formatMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatProductLabel(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function extractPackageCount(sourceLabel: string | null): number | null {
  if (!sourceLabel) {
    return null;
  }

  const normalized = sourceLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/\b(\d+)\s*(u|un|un\.|unidad|unidades|huevos)\b/);
  if (!match) {
    return null;
  }

  const count = Number.parseInt(match[1], 10);
  return Number.isNaN(count) ? null : count;
}

function isBlueberryPackLabel(sourceLabel: string | null): boolean {
  if (!sourceLabel) {
    return false;
  }

  const normalized = sourceLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.includes('arand') && (normalized.includes('petaca') || normalized.includes('bandeja'));
}

function extractPackageSize(sourceLabel: string | null): { value: number; unit: 'KG' | 'LITER' } | null {
  if (!sourceLabel) {
    return null;
  }

  const normalized = sourceLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|cc|l|lt)\b/);

  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1].replace(',', '.'));
  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (match[2] === 'kg') {
    return { value: numericValue, unit: 'KG' };
  }

  if (match[2] === 'g' || match[2] === 'gr') {
    return { value: numericValue / 1000, unit: 'KG' };
  }

  if (match[2] === 'l' || match[2] === 'lt') {
    return { value: numericValue, unit: 'LITER' };
  }

  if (match[2] === 'ml' || match[2] === 'cc') {
    return { value: numericValue / 1000, unit: 'LITER' };
  }

  return null;
}

function isValidPedidosYaDisplayPrice(productName: string, sourceLabel: string | null): boolean {
  const normalizedProductName = normalizeCatalogValue(productName);
  const normalizedSourceLabel = normalizeCatalogValue(sourceLabel ?? '');

  if (!normalizedSourceLabel) {
    return false;
  }

  const disallowedTokens: Record<string, string[]> = {
    arandanos: ['congelado', 'congelados'],
    'arroz integral': ['galleta', 'galletas'],
    banana: ['barra', 'proteica', 'bites', 'dulce', 'chocolate', 'chips', 'gomitas', 'gomita'],
    naranja: ['barra', 'proteica', 'vegana', 'jugo', 'tang', 'mango', 'polvo'],
    pera: ['budin', 'mermelada', 'jabon', 'tocador'],
    salmon: ['ahumado'],
    tomate: ['frito', 'salsa', 'pure', 'sin tacc', 'rio de la plata', 'enteros', 'cololo', 'pelados', 'arcor', 'mazza', 'lata', 'natural'],
    harina: ['integral', 'leudante', 'avena'],
    'harina integral': ['leudante'],
    durazno: ['almibar', 'mermelada', 'compota', 'yogur', 'petaca', 'pingakol']
  };

  const requiredTokens: Record<string, string[]> = {
    arandanos: ['petaca'],
    'arroz integral': ['arroz', 'integral', 'saman'],
    banana: ['banana'],
    naranja: ['naranja'],
    pera: ['pera'],
    salmon: ['salmon'],
    tomate: ['tomate', 'perita'],
    harina: ['harina'],
    'harina integral': ['harina', 'integral', 'canuelas'],
    durazno: ['durazno']
  };

  const requiredAnyTokens: Record<string, string[]> = {
    harina: ['0000', 'trigo']
  };

  if ((disallowedTokens[normalizedProductName] ?? []).some((token) => includesAsFullWord(normalizedSourceLabel, token))) {
    return false;
  }

  const required = requiredTokens[normalizedProductName] ?? [];
  if (required.length > 0 && !required.every((token) => includesAsFullWord(normalizedSourceLabel, token))) {
    return false;
  }

  const requiredAny = requiredAnyTokens[normalizedProductName] ?? [];
  if (requiredAny.length > 0 && !requiredAny.some((token) => includesAsFullWord(normalizedSourceLabel, token))) {
    return false;
  }

  return true;
}

function isValidDiscoDisplayPrice(productName: string, sourceLabel: string | null): boolean {
  const normalizedProductName = normalizeCatalogValue(productName);
  const normalizedSourceLabel = normalizeCatalogValue(sourceLabel ?? '');

  if (!normalizedSourceLabel) {
    return false;
  }

  const disallowedTokens: Record<string, string[]> = {
    arandanos: ['deshidratado', 'deshidratados', 'congelado', 'congelados'],
    banana: ['barrita', 'gomita', 'yogur', 'yogurt', 'cereal'],
    'calabacin': ['cocido', 'vapor', 'noodles', 'crema', 'frutos del maipo'],
    'cebolla blanca': ['aros', 'aro', 'anillos', 'roja', 'morada', 'colorada'],
    'morron rojo': ['tiras'],
    'morron verde': ['tiras', 'envasado'],
    pepino: ['vinagre', 'dulce', 'rodajas', 'japones'],
    zanahoria: ['vapor', 'rallada', 'baby', 'cubos'],
    zapallito: ['tarta', 'tartita', 'tiras'],
    tomate: ['frito', 'salsa', 'pure', 'cubeteado', 'triturado', 'pelado', 'entero', 'mutti'],
    durazno: ['almibar', 'mermelada', 'yogur', 'yogurt', 'postre'],
    pera: ['jabon', 'budin', 'mermelada', 'postre', 'almibar'],
    zucchini: ['zuccini', 'semilla', 'sobre', 'quintero']
  };

  const requiredTokens: Record<string, string[]> = {
    arandanos: ['arandanos'],
    'bidon agua': ['agua', 'salus', '6.25'],
    'aceite de coco terra verde 475ml': ['aceite', 'coco', 'terra', 'verde', '475'],
    harina: ['harina', 'canuelas'],
    'harina comun 1kg': ['harina'],
    'harina integral': ['harina', 'integral', 'canuelas'],
    'yerba mate compuesta 1kg': ['yerba', 'compuesta'],
    'calabacin': ['calabacin'],
    'cebolla blanca': ['cebolla', 'especial'],
    'morron rojo': ['morron', 'rojo', 'especial'],
    'morron verde': ['morron', 'verde', 'especial'],
    pepino: ['pepino'],
    zanahoria: ['zanahoria', 'bolsita'],
    zapallito: ['zapallito'],
    melon: ['melon', 'escrito'],
    'leche de almendras sin azucar': ['silk', 'sin', 'azucar'],
    'leche descremada': ['leche', 'descremada', 'conaprole']
  };

  const requiredAnyTokens: Record<string, string[]> = {
    arandanos: ['petaca', 'bandeja'],
    harina: ['0000'],
    'harina comun 1kg': ['precio', 'lider'],
    'yerba mate compuesta 1kg': ['armino'],
    pepino: ['aprox'],
    zapallito: ['aprox'],
    'leche de almendras sin azucar': ['almendra', 'almendras'],
    naranja: ['malla', 'importada']
  };

  if ((disallowedTokens[normalizedProductName] ?? []).some((token) => includesAsFullWord(normalizedSourceLabel, token))) {
    return false;
  }

  const required = requiredTokens[normalizedProductName] ?? [];
  if (required.length > 0 && !required.every((token) => includesAsFullWord(normalizedSourceLabel, token))) {
    return false;
  }

  const requiredAny = requiredAnyTokens[normalizedProductName] ?? [];
  if (requiredAny.length > 0 && !requiredAny.some((token) => includesAsFullWord(normalizedSourceLabel, token))) {
    return false;
  }

  return true;
}

function includesAsFullWord(candidateName: string, phrase: string): boolean {
  const tokens = candidateName.split(' ');
  const phraseTokens = phrase.split(' ');

  for (let index = 0; index <= tokens.length - phraseTokens.length; index += 1) {
    if (tokens.slice(index, index + phraseTokens.length).join(' ') === phrase) {
      return true;
    }
  }

  return false;
}
