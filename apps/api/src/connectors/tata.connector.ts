import { ProductUnit, StoreType } from '@prisma/client';
import { decodeMojibake, normalizeText } from '../normalizers/text';
import { prisma } from '../services/prisma';

const TATA_GRAPHQL_URL = 'https://www.tata.com.uy/api/graphql';
const TATA_STORE_NAME = 'Tata';
const TATA_CHANNEL = '{"salesChannel":"4","regionId":""}';
const TATA_LOCALE = 'es-uy';
const FRUITS_AND_VEGETABLES_CLUSTER = 'frutas y verduras';
const ALLOWED_CATEGORY_TOKENS = [
  'frutas y verduras',
  'congelados',
  'lacteos',
  'yogures',
  'huevos',
  'almacen',
  'fideos'
];

interface TataSyncSummary {
  processed: number;
  matched: number;
  skipped: number;
  failed: number;
}

interface TataGraphQLResponse {
  data?: {
    search?: {
      products?: {
        edges?: Array<{
          node?: TataSearchProduct;
        }>;
      };
    };
  };
}

interface TataSearchProduct {
  name?: string;
  measurementUnit?: string | null;
  unitMultiplier?: number | null;
  clusterHighlights?: Array<{ name?: string | null }> | null;
  offers?: {
    lowPrice?: number | null;
  } | null;
}

export async function syncTataPrices(): Promise<TataSyncSummary> {
  const tataStore = await prisma.store.upsert({
    where: { name: TATA_STORE_NAME },
    update: { type: StoreType.SUPERMARKET },
    create: {
      name: TATA_STORE_NAME,
      type: StoreType.SUPERMARKET
    }
  });

  const products = await prisma.product.findMany({
    include: { brand: true, aliases: true },
    orderBy: { id: 'asc' }
  });

  const summary: TataSyncSummary = {
    processed: 0,
    matched: 0,
    skipped: 0,
    failed: 0
  };

  for (const product of products) {
    summary.processed += 1;

    try {
      const candidates = await searchTataProductsForProduct(product);
      const match = pickBestTataMatch(product, candidates);

      if (!match || typeof match.offers?.lowPrice !== 'number') {
        summary.skipped += 1;
        continue;
      }

      const lowPrice = match.offers.lowPrice;
      const storeProduct = await prisma.storeProduct.upsert({
        where: {
          storeId_productId: {
            storeId: tataStore.id,
            productId: product.id
          }
        },
        update: {},
        create: {
          storeId: tataStore.id,
          productId: product.id
        }
      });

      await prisma.price.create({
        data: {
          productId: product.id,
          storeProductId: storeProduct.id,
          price: lowPrice,
          pricePerKg: resolvePricePerKg(product, match, lowPrice),
          pricePerLiter: resolvePricePerLiter(product, match, lowPrice),
          pricePerUnit: resolvePricePerUnit(product, match, lowPrice),
          sourceLabel: match.name ? decodeMojibake(match.name) : null
        }
      });

      summary.matched += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`Tata sync failed for "${product.name}"`, error);
    }
  }

  return summary;
}

async function searchTataProducts(term: string): Promise<TataSearchProduct[]> {
  const variables = {
    first: 12,
    after: '0',
    sort: 'score_desc',
    term,
    selectedFacets: [
      { key: 'channel', value: TATA_CHANNEL },
      { key: 'locale', value: TATA_LOCALE }
    ],
    sponsoredCount: 3
  };

  const url = new URL(TATA_GRAPHQL_URL);
  url.searchParams.set('operationName', 'ProductsQuery');
  url.searchParams.set('variables', JSON.stringify(variables));

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Tata GraphQL returned ${response.status}`);
  }

  const payload = (await response.json()) as TataGraphQLResponse;
  return payload.data?.search?.products?.edges?.flatMap((edge) => (edge.node ? [edge.node] : [])) ?? [];
}

async function searchTataProductsForProduct(product: {
  name: string;
  brand?: { name: string } | null;
  aliases?: Array<{ alias: string }>;
}): Promise<TataSearchProduct[]> {
  const terms = buildSearchTerms(product.name, product.brand?.name ?? null, product.aliases ?? []);
  const resultSets = await Promise.all(terms.map((term) => searchTataProducts(term)));
  const mergedCandidates = new Map<string, TataSearchProduct>();

  for (const candidates of resultSets) {
    for (const candidate of candidates) {
      const key = normalizeText(candidate.name ?? '');
      if (!key) {
        continue;
      }

      if (!mergedCandidates.has(key)) {
        mergedCandidates.set(key, candidate);
      }
    }
  }

  return Array.from(mergedCandidates.values());
}

function isValidTataMatch(
  product: {
    name: string;
    baseUnit: ProductUnit;
    sizeValue: number;
    brand?: { name: string } | null;
    aliases?: Array<{ alias: string }>;
  },
  candidate: TataSearchProduct
): boolean {
  const normalizedCandidateName = normalizeText(candidate.name ?? '');
  const normalizedProductName = normalizeText(product.name);
  const normalizedBrandName = normalizeText(product.brand?.name ?? '');
  const candidateStems = buildComparableTokens(candidate.name ?? '');
  const productStems = buildComparableTokens(product.name);
  const aliasNames = product.aliases?.map((alias) => normalizeText(alias.alias)).filter(Boolean) ?? [];
  const aliasStemSets = aliasNames.map((alias) => buildComparableTokens(alias));

  if (!normalizedCandidateName) {
    return false;
  }

  const productKey = resolveTataProductKey(product.name);
  if (productKey === 'yogur deslactosado' && !includesAsFullWord(normalizedCandidateName, 'deslactosado')) {
    return false;
  }

  if (!hasCompatibleCategory(product, candidate, normalizedBrandName, aliasNames)) {
    return false;
  }

  if (!hasCompatibleMeasurement(product, candidate)) {
    return false;
  }

  const productNameMatches =
    normalizedCandidateName.startsWith(normalizedProductName) ||
    includesAsFullWord(normalizedCandidateName, normalizedProductName) ||
    Array.from(productStems).every((token) => candidateStems.has(token)) ||
    aliasNames.some(
      (alias) =>
        normalizedCandidateName.startsWith(alias) ||
        includesAsFullWord(normalizedCandidateName, alias)
    ) ||
    aliasStemSets.some((aliasStemSet) => Array.from(aliasStemSet).every((token) => candidateStems.has(token))) ||
    isEggFamilyMatch(normalizedProductName, normalizedCandidateName) ||
    isEquivalentPaperTowelMatch(product, candidate) ||
    isEquivalentLiquidPackMatch(product, candidate);

  if (!productNameMatches) {
    return false;
  }

  if (normalizedBrandName) {
    return includesAsFullWord(normalizedCandidateName, normalizedBrandName);
  }

  return true;
}

function hasFruitsAndVegetablesCluster(
  clusterHighlights: TataSearchProduct['clusterHighlights']
): boolean {
  return (
    clusterHighlights?.some((cluster) =>
      normalizeText(cluster.name ?? '').includes(FRUITS_AND_VEGETABLES_CLUSTER)
    ) ?? false
  );
}

function resolveTataProductKey(value: string): string {
  const normalized = normalizeText(value);

  if (normalized.startsWith('yogur deslactosado natural')) {
    return 'yogur deslactosado';
  }

  if (normalized.startsWith('yogurt integral') || normalized.startsWith('yogur integral')) {
    return 'yogurt integral';
  }

  return normalized;
}

function hasExpectedMeasurementUnit(baseUnit: ProductUnit, measurementUnit: string | null | undefined): boolean {
  const normalizedUnit = normalizeMeasurementUnit(measurementUnit);

  if (baseUnit === ProductUnit.KG) {
    return normalizedUnit === 'kg';
  }

  if (baseUnit === ProductUnit.UNIT) {
    return normalizedUnit === 'un';
  }

  if (baseUnit === ProductUnit.LITER) {
    return normalizedUnit === 'l';
  }

  return false;
}

function hasCompatibleCategory(
  product: { brand?: { name: string } | null },
  candidate: TataSearchProduct,
  normalizedBrandName: string,
  aliasNames: string[]
): boolean {
  if (normalizedBrandName && includesAsFullWord(normalizeText(candidate.name ?? ''), normalizedBrandName)) {
    return true;
  }

  if (aliasNames.some((alias) => includesAsFullWord(normalizeText(candidate.name ?? ''), alias))) {
    return true;
  }

  return hasAllowedCategory(candidate.clusterHighlights);
}

function hasCompatibleMeasurement(
  product: { name: string; baseUnit: ProductUnit; sizeValue: number; brand?: { name: string } | null },
  candidate: TataSearchProduct
): boolean {
  if (hasExpectedMeasurementUnit(product.baseUnit, candidate.measurementUnit)) {
    return true;
  }

  const normalizedMeasurementUnit = normalizeMeasurementUnit(candidate.measurementUnit);
  if (normalizedMeasurementUnit !== 'un') {
    return false;
  }

  const packageCount = extractPackageCount(candidate.name ?? '');
  if (product.baseUnit === ProductUnit.LITER && packageCount && packageCount === product.sizeValue) {
    return true;
  }

  const packageSize = extractPackageSize(candidate.name ?? '');

  if (!packageSize) {
    return false;
  }

  if (product.baseUnit === ProductUnit.KG && packageSize.unit === 'KG') {
    if (product.brand) {
      return true;
    }
    return almostEqual(packageSize.value, product.sizeValue);
  }

  if (product.baseUnit === ProductUnit.LITER && packageSize.unit === 'LITER') {
    if (product.brand) {
      return true;
    }
    return almostEqual(packageSize.value, product.sizeValue);
  }

  if (product.baseUnit === ProductUnit.LITER && isYogurtLikeProduct(product.name) && packageSize.unit === 'KG') {
    if (product.brand) {
      return true;
    }
    return almostEqual(packageSize.value, product.sizeValue, 0.08);
  }

  return false;
}

function normalizeMeasurementUnit(value: string | null | undefined): string {
  const normalized = (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

  if (normalized === 'lt' || normalized === 'lts' || normalized === 'litro' || normalized === 'litros') {
    return 'l';
  }

  return normalized;
}

function hasAllowedCategory(clusterHighlights: TataSearchProduct['clusterHighlights']): boolean {
  return (
    clusterHighlights?.some((cluster) => {
      const normalizedCluster = normalizeText(cluster.name ?? '');
      return ALLOWED_CATEGORY_TOKENS.some((token) => normalizedCluster.includes(token));
    }) ?? false
  );
}

function includesAsFullWord(candidateName: string, productName: string): boolean {
  const tokens = candidateName.split(' ');
  const phraseTokens = productName.split(' ');

  for (let index = 0; index <= tokens.length - phraseTokens.length; index += 1) {
    const slice = tokens.slice(index, index + phraseTokens.length).join(' ');
    if (slice === productName) {
      return true;
    }
  }

  return false;
}

function buildSearchTerm(productName: string, brandName: string | null): string {
  return brandName ? `${productName} ${brandName}` : productName;
}

function buildSearchTerms(
  productName: string,
  brandName: string | null,
  aliases: Array<{ alias: string }>
): string[] {
  const terms = new Set<string>();
  terms.add(buildSearchTerm(productName, brandName));
  terms.add(productName);
  if (brandName) {
    terms.add(brandName);
  }
  const strippedProductName = stripSearchDescriptors(productName);
  if (strippedProductName && strippedProductName !== productName) {
    terms.add(strippedProductName);
    if (brandName) {
      terms.add(buildSearchTerm(strippedProductName, brandName));
    }
  }

  for (const alias of aliases.slice(0, 4)) {
    terms.add(alias.alias);
  }

  const preferredPackageCount = extractPreferredPackageCount(aliases);
  if (preferredPackageCount !== null && (productName.includes('huevo') || productName.includes('huevos'))) {
    terms.add(`huevos ${preferredPackageCount}`);
    terms.add(`maple x${preferredPackageCount}`);
  }

  return Array.from(terms).filter((term) => term.trim().length > 0);
}

function stripSearchDescriptors(value: string): string {
  return decodeMojibake(value)
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|gr|ml|l|lt|panos?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestTataMatch(
  product: { name: string; baseUnit: ProductUnit; sizeValue: number; brand?: { name: string } | null },
  candidates: TataSearchProduct[]
): TataSearchProduct | null {
  let bestCandidate: TataSearchProduct | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (!isValidTataMatch(product, candidate)) {
      continue;
    }

    const score = scoreCandidate(product, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function extractPackageSize(name: string): { value: number; unit: 'KG' | 'LITER' } | null {
  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalizedName.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|l|lt)\b/);

  if (!match) {
    return null;
  }

  const rawValue = Number.parseFloat(match[1].replace(',', '.'));
  const rawUnit = match[2];

  if (Number.isNaN(rawValue)) {
    return null;
  }

  if (rawUnit === 'kg') {
    return { value: rawValue, unit: 'KG' };
  }

  if (rawUnit === 'g' || rawUnit === 'gr') {
    return { value: rawValue / 1000, unit: 'KG' };
  }

  if (rawUnit === 'l' || rawUnit === 'lt') {
    return { value: rawValue, unit: 'LITER' };
  }

  if (rawUnit === 'ml') {
    return { value: rawValue / 1000, unit: 'LITER' };
  }

  return null;
}

function almostEqual(left: number, right: number, tolerance = 0.001): boolean {
  return Math.abs(left - right) < tolerance;
}

function scoreCandidate(
  product: {
    name: string;
    baseUnit: ProductUnit;
    sizeValue: number;
    brand?: { name: string } | null;
    aliases?: Array<{ alias: string }>;
  },
  candidate: TataSearchProduct
): number {
  let score = 0;
  const normalizedCandidateName = normalizeText(candidate.name ?? '');
  const normalizedProductName = normalizeText(product.name);
  const normalizedBrandName = normalizeText(product.brand?.name ?? '');

  if (normalizedCandidateName.startsWith(normalizedProductName)) {
    score += 50;
  }

  if (normalizedBrandName && includesAsFullWord(normalizedCandidateName, normalizedBrandName)) {
    score += 100;
  }

  if (hasFruitsAndVegetablesCluster(candidate.clusterHighlights)) {
    score += 120;
  }

  if (hasAllowedCategory(candidate.clusterHighlights)) {
    score += 20;
  }

  if (normalizeText(product.name) === 'arandanos' && normalizeText(candidate.name ?? '').includes('importado pet')) {
    score += 1000;
  }

  const packageSize = extractPackageSize(candidate.name ?? '');
  if (packageSize) {
    const expected = product.sizeValue;
    const distance = Math.abs(packageSize.value - expected);
    score += Math.max(0, 200 - distance * 200);
  }

  const packageCount = extractPackageCount(candidate.name ?? '');
  const preferredPackageCount = extractPreferredPackageCount(product.aliases ?? []);

  if (packageCount !== null && preferredPackageCount !== null) {
    score += Math.max(0, 120 - Math.abs(packageCount - preferredPackageCount) * 10);
  }

  return score;
}

function resolvePricePerKg(
  product: { baseUnit: ProductUnit; sizeValue: number },
  candidate: TataSearchProduct,
  price: number
): number | null {
  if (product.baseUnit !== ProductUnit.KG) {
    return null;
  }

  const measurementUnit = normalizeMeasurementUnit(candidate.measurementUnit);
  if (measurementUnit === 'kg' && typeof candidate.unitMultiplier === 'number' && candidate.unitMultiplier > 0) {
    return price / candidate.unitMultiplier;
  }

  const packageSize = extractPackageSize(candidate.name ?? '');
  return packageSize?.unit === 'KG' ? price / packageSize.value : price;
}

function resolvePricePerLiter(
  product: { name: string; baseUnit: ProductUnit; sizeValue: number },
  candidate: TataSearchProduct,
  price: number
): number | null {
  if (product.baseUnit !== ProductUnit.LITER) {
    return null;
  }

  const measurementUnit = normalizeMeasurementUnit(candidate.measurementUnit);
  if (measurementUnit === 'l' && typeof candidate.unitMultiplier === 'number' && candidate.unitMultiplier > 0) {
    return price / candidate.unitMultiplier;
  }

  const packageCount = extractPackageCount(candidate.name ?? '');
  if (measurementUnit === 'un' && packageCount && product.sizeValue > 1 && almostEqual(product.sizeValue, packageCount)) {
    return price / product.sizeValue;
  }

  const packageSize = extractPackageSize(candidate.name ?? '');
  if (isYogurtLikeProduct(product.name) && packageSize?.unit === 'KG') {
    return price / packageSize.value;
  }
  return packageSize?.unit === 'LITER' ? price / packageSize.value : price;
}

function resolvePricePerUnit(
  product: { name: string; baseUnit: ProductUnit; brand?: { name: string } | null },
  candidate: TataSearchProduct,
  price: number
): number | null {
  if (product.baseUnit !== ProductUnit.UNIT) {
    return null;
  }

  if (isEquivalentPaperTowelMatch(product, candidate)) {
    return price;
  }

  const packageCount = extractPackageCount(candidate.name ?? '');
  return packageCount && packageCount > 0 ? price / packageCount : price;
}

function buildComparableTokens(value: string): Set<string> {
  const tokens = normalizeText(
    value.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2')
  )
    .split(' ')
    .filter(Boolean)
    .map(normalizeComparableToken);

  return new Set(tokens.filter((token) => token.length > 0));
}

function isYogurtLikeProduct(value: string) {
  const normalized = normalizeText(value);
  return normalized.startsWith('yogur') || normalized.startsWith('yogurt');
}

function normalizeComparableToken(token: string): string {
  if (['de', 'del', 'la', 'el', 'los', 'las'].includes(token)) {
    return '';
  }

  if (token === 'yogurt') {
    return 'yogur';
  }

  if (token === 'colorada') {
    return 'roja';
  }

  if (token === 'zuccini') {
    return 'zucchini';
  }

  if (token === 'comun' || token === '000' || token === '0000') {
    return 'comun';
  }

  if (token.endsWith('ones') && token.length > 5) {
    return `${token.slice(0, -2)}`;
  }

  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}

function isEggFamilyMatch(productName: string, candidateName: string): boolean {
  return (
    (productName.includes('huevo') || productName.includes('huevos')) &&
    (candidateName.includes('huevo') || candidateName.includes('huevos'))
  );
}

function extractPackageCount(name: string): number | null {
  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalizedName.match(/\b(\d+)\s*(u|un|unid|unids|unidad|unidades)\b/);
  if (!match) {
    return null;
  }

  const count = Number.parseInt(match[1], 10);
  return Number.isNaN(count) ? null : count;
}

function extractSheetCount(name: string): number | null {
  const normalizedName = decodeMojibake(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalizedName.match(/\b(\d+)\s*panos?\b/);
  if (!match) {
    return null;
  }

  const count = Number.parseInt(match[1], 10);
  return Number.isNaN(count) ? null : count;
}

function isEquivalentPaperTowelMatch(
  product: { name: string; baseUnit: ProductUnit; brand?: { name: string } | null },
  candidate: TataSearchProduct
): boolean {
  if (product.baseUnit !== ProductUnit.UNIT) {
    return false;
  }

  const normalizedProductName = normalizeText(product.name);
  if (!normalizedProductName.includes('toalla de papel')) {
    return false;
  }

  const productSheets = extractSheetCount(product.name);
  const candidateSheets = extractSheetCount(candidate.name ?? '');
  const packageCount = extractPackageCount(candidate.name ?? '') ?? 1;
  const normalizedCandidateName = normalizeText(candidate.name ?? '');
  const normalizedBrandName = normalizeText(product.brand?.name ?? '');

  if (!productSheets || !candidateSheets) {
    return false;
  }

  if (normalizedBrandName && !includesAsFullWord(normalizedCandidateName, normalizedBrandName)) {
    return false;
  }

  return candidateSheets * packageCount === productSheets;
}

function isEquivalentLiquidPackMatch(
  product: { name: string; baseUnit: ProductUnit; sizeValue: number; brand?: { name: string } | null },
  candidate: TataSearchProduct
): boolean {
  if (product.baseUnit !== ProductUnit.LITER || product.sizeValue <= 1) {
    return false;
  }

  const normalizedCandidateName = normalizeText(candidate.name ?? '');
  const normalizedBrandName = normalizeText(product.brand?.name ?? '');
  const packageCount = extractPackageCount(candidate.name ?? '');

  if (!packageCount || packageCount !== product.sizeValue) {
    return false;
  }

  if (normalizedBrandName && !includesAsFullWord(normalizedCandidateName, normalizedBrandName)) {
    return false;
  }

  return Array.from(buildComparableTokens(product.name)).every((token) => buildComparableTokens(candidate.name ?? '').has(token));
}

function extractPreferredPackageCount(aliases: Array<{ alias: string }>): number | null {
  let preferredCount: number | null = null;

  for (const alias of aliases) {
    const normalizedAlias = alias.alias
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    const match = normalizedAlias.match(/\b(?:x\s*)?(\d+)\b/);
    if (match) {
      const count = Number.parseInt(match[1], 10);
      if (!Number.isNaN(count) && count > 1) {
        preferredCount = preferredCount === null ? count : Math.max(preferredCount, count);
      }
    }
  }

  return preferredCount;
}
