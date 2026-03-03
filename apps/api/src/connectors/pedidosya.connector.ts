import { ProductUnit, StoreType } from '@prisma/client';
import { normalizeText } from '../normalizers/text';
import { getPedidosYaSession } from '../services/pedidosyaSession';
import { prisma } from '../services/prisma';

const PEDIDOSYA_SEARCH_URL = 'https://www.pedidosya.com.uy/groceries/web/v1/catalogues/306090/search';
const PEDIDOSYA_STORE_NAME = 'PedidosYaMarket';
const PEDIDOSYA_PARTNER_ID = '286802';
const PEDIDOSYA_REFERER = 'https://www.pedidosya.com.uy/';
const PEDIDOSYA_PRODUCT_DELAY_MS = 900;
const PEDIDOSYA_QUERY_DELAY_MS = 450;
const PEDIDOSYA_MAX_TERMS = 3;
const BRAND_OPTIONAL_PRODUCTS = new Set([
  'yogur',
  'harina',
  'harina integral',
  'brocoli congelado',
  'espinaca congelada',
  'palta hass',
  'arandanos'
]);
const PEDIDOSYA_PREFERRED_TERMS: Record<string, string[]> = {
  'aceite de coco terra verde': ['aceite de coco terra verde', 'coco terra verde', 'terra verde'],
  'arroz integral': ['arroz saman integral', 'arroz integral saman', 'arroz saman'],
  arandanos: ['arandanos en petaca', 'arandano petaca', 'arandanos'],
  avena: ['avena puritas', 'puritas', 'avena'],
  'bidon agua': ['bidon agua salus 6.25 l', 'bidon agua salus', 'agua salus'],
  'brocoli congelado': ['brocoli flanders', 'brocoli congelado', 'brocoli'],
  'espinaca congelada': ['espinaca flanders', 'espinaca triturada', 'espinaca'],
  harina: ['harina 0000 canuelas', 'harina canuelas 0000', 'harina de trigo fortin'],
  'harina comun': ['harina de trigo fortin 1 kg', 'harina fortin', 'harina comun'],
  'harina integral': ['harina canuelas 100 integral', 'harina canuelas integral', 'harina integral canuelas'],
  'jabon liquido fresh': ['jabon liquido para lavar ropa conejo fresh 3 l', 'jabon liquido conejo fresh 3 l', 'conejo fresh 3 l'],
  limon: ['limon kg', 'limon', 'limones'],
  'papel higienico higienol max hoja simple 4 u': ['papel higienico higienol max hoja simple 4 unidades', 'higienol max hoja simple 4', 'papel higienico higienol'],
  'palta hass': ['palta hass importada', 'palta hass', 'palta'],
  sandia: ['sandia kg', 'sandia'],
  tirabuzones: ['fideos adria tirabuzon', 'tirabuzon adria', 'tirabuzones'],
  'yerba mate compuesta': ['yerba mate compuesta armino 1 kg', 'yerba mate compuesta armino', 'armino yerba compuesta'],
  yogur: ['yogurisimo sin azucares agregados', 'yogur ser', 'yogur'],
  zanahoria: ['zanahoria kg', 'zanahoria'],
  zapallito: ['zapallito express', 'zapallito kg', 'zapallito'],
  banana: ['banana brasil', 'banana kg', 'banana'],
  naranja: ['naranja kg', 'naranja', 'naranja de mesa'],
  pera: ['pera kg', 'pera nacional', 'pera'],
  tomate: ['tomate perita', 'tomate kg', 'tomate'],
  salmon: ['salmon mar austral', 'salmon congelado', 'salmon'],
  durazno: ['durazno fresco', 'durazno kg', 'durazno']
};
const PEDIDOSYA_EXTRA_TERMS: Record<string, string[]> = {
  'aceite de coco terra verde': ['aceite de coco', 'terra verde', 'coco terra verde'],
  'arroz integral': ['arroz saman', 'arroz integral saman', 'arroz'],
  arandanos: ['arandano', 'arandano importado', 'arandano pet', 'arandanos'],
  avena: ['avena puritas', 'avena'],
  'bidon agua': ['agua salus', 'bidon salus', 'bidon agua'],
  'brocoli congelado': ['brocoli', 'brocoli flanders', 'brocoli congelado'],
  'espinaca congelada': ['espinaca', 'espinaca flanders', 'espinaca triturada'],
  harina: ['harina canuelas 0000', 'harina de trigo', 'harina'],
  'harina comun': ['harina de trigo', 'harina fortin', 'harina comun'],
  'harina integral': ['harina integral', 'harina canuelas integral', '100 integral'],
  'jabon liquido fresh': ['jabon liquido conejo', 'conejo fresh', 'jabon para lavar ropa'],
  limon: ['limon', 'limones'],
  'papel higienico higienol max hoja simple 4 u': ['higienol max', 'papel higienico higienol', 'hoja simple 4 unidades'],
  'palta hass': ['palta', 'palta hass', 'palta importada'],
  sandia: ['sandia', 'sandia kg'],
  tirabuzones: ['tirabuzones', 'tirabuzon adria', 'fideos tirabuzon'],
  yogur: ['yogur', 'yogurt', 'yogurisimo sin azucares agregados'],
  durazno: ['durazno', 'durazno fresco'],
  'yerba mate compuesta': ['yerba mate compuesta', 'yerba armino', 'armino'],
  zanahoria: ['zanahoria'],
  zapallito: ['zapallito', 'zapallito express']
};
const PEDIDOSYA_DISALLOWED_TOKENS: Record<string, string[]> = {
  arandanos: ['congelado', 'congelados'],
  'aceite de coco terra verde': ['capsula', 'suplemento'],
  'arroz integral': ['galleta', 'galletas'],
  banana: ['barra', 'proteica', 'bites', 'dulce', 'chocolate', 'chips', 'gomitas', 'gomita'],
  'bidon agua': ['caramanola', 'pack', 'vaso'],
  naranja: ['barra', 'proteica', 'vegana', 'jugo', 'tang', 'mango', 'polvo'],
  pera: ['budin', 'mermelada', 'jabon', 'tocador'],
  salmon: ['ahumado'],
  tomate: ['frito', 'salsa', 'pure', 'sin tacc', 'rio de la plata', 'enteros', 'cololo', 'pelados', 'arcor', 'mazza', 'lata', 'natural'],
  harina: ['integral', 'leudante', 'avena'],
  'harina comun': ['integral', 'leudante', 'avena', 'canuelas'],
  'harina integral': ['leudante'],
  'jabon liquido fresh': ['doypack', 'suavizante', '800 ml', '900 ml'],
  limon: ['mayonesa', 'jugo', 'limonada', 'detergente', 'limpieza'],
  'papel higienico higienol max hoja simple 4 u': ['cocina', 'servilleta', 'toalla'],
  'palta hass': ['aceite'],
  sandia: ['gomitas', 'gummy', 'yummy', 'caramelo'],
  durazno: ['almibar', 'mermelada', 'yogur', 'compota', 'petaca', 'pingakol']
  ,
  zanahoria: ['rallada', 'fisema', 'ensalada'],
  zapallito: ['tartita', 'tarta', 'delibest']
};
const PEDIDOSYA_REQUIRED_TOKENS: Record<string, string[]> = {
  'aceite de coco terra verde': ['aceite', 'coco', 'terra', 'verde'],
  arandanos: ['petaca'],
  'arroz integral': ['arroz', 'integral', 'saman'],
  banana: ['banana'],
  'bidon agua': ['agua', 'salus'],
  naranja: ['naranja'],
  pera: ['pera'],
  salmon: ['salmon'],
  tomate: ['tomate', 'perita'],
  harina: ['harina'],
  'harina comun': ['harina', 'fortin'],
  'harina integral': ['harina', 'integral', 'canuelas'],
  'brocoli congelado': ['brocoli'],
  'espinaca congelada': ['espinaca'],
  'jabon liquido fresh': ['jabon', 'liquido', 'conejo', 'fresh'],
  limon: ['limon'],
  'papel higienico higienol max hoja simple 4 u': ['papel', 'higienico', 'higienol', 'max', 'hoja', 'simple'],
  yogur: ['yogur'],
  sandia: ['sandia'],
  tirabuzones: ['tirabuzon'],
  'palta hass': ['palta'],
  durazno: ['durazno'],
  'yerba mate compuesta': ['yerba', 'mate', 'compuesta', 'armino'],
  zanahoria: ['zanahoria'],
  zapallito: ['zapallito']
};
const PEDIDOSYA_REQUIRED_ANY_TOKENS: Record<string, string[]> = {
  harina: ['0000', 'trigo'],
  'bidon agua': ['6.25', '625', '6,25'],
  'jabon liquido fresh': ['3', '3l', '3lt', '3lts']
};
const PEDIDOSYA_PREFERRED_SCORE_TOKENS: Record<string, string[]> = {
  'aceite de coco terra verde': ['terra', 'verde', '475'],
  'arroz integral': ['saman'],
  harina: ['canuelas', '0000'],
  'harina comun': ['fortin', 'trigo'],
  'harina integral': ['canuelas', '100', 'integral'],
  'jabon liquido fresh': ['3', 'ropa'],
  'papel higienico higienol max hoja simple 4 u': ['4'],
  'yerba mate compuesta': ['armino', '1'],
  yogur: ['ser'],
  tirabuzones: ['adria'],
  arandanos: ['petaca'],
  'bidon agua': ['salus', '6.25']
};

interface PedidosYaSyncSummary {
  processed: number;
  matched: number;
  skipped: number;
  failed: number;
  blocked?: boolean;
  message?: string | null;
}

interface PedidosYaSearchResponse {
  data?: PedidosYaProduct[];
  appId?: string;
  blockScript?: string;
  jsClientSrc?: string;
}

interface PedidosYaProduct {
  name?: string;
  price?: number;
  price_per_measurement_unit?: number;
  content_quantity?: number;
  measurement_unit?: {
    short_name?: string;
  } | null;
}

type CatalogProduct = {
  id: number;
  name: string;
  baseUnit: ProductUnit;
  sizeValue: number;
  brand?: { name: string } | null;
  aliases?: Array<{ alias: string }>;
};

export async function syncPedidosYaPrices(): Promise<PedidosYaSyncSummary> {
  const pedidosYaStore = await prisma.store.upsert({
    where: { name: PEDIDOSYA_STORE_NAME },
    update: { type: StoreType.DELIVERY },
    create: {
      name: PEDIDOSYA_STORE_NAME,
      type: StoreType.DELIVERY
    }
  });

  const products = await prisma.product.findMany({
    include: { brand: true, aliases: true },
    orderBy: { id: 'asc' }
  });

  const summary: PedidosYaSyncSummary = {
    processed: 0,
    matched: 0,
    skipped: 0,
    failed: 0,
    blocked: false,
    message: null
  };
  const queryCache = new Map<string, PedidosYaProduct[]>();

  for (const product of products) {
    summary.processed += 1;

    try {
      const candidates = await searchPedidosYaForProduct(product, queryCache);
      const match = pickBestPedidosYaMatch(product, candidates);

      if (!match || typeof match.price !== 'number') {
        summary.skipped += 1;
        await sleep(PEDIDOSYA_PRODUCT_DELAY_MS);
        continue;
      }

      const storeProduct = await prisma.storeProduct.upsert({
        where: {
          storeId_productId: {
            storeId: pedidosYaStore.id,
            productId: product.id
          }
        },
        update: {},
        create: {
          storeId: pedidosYaStore.id,
          productId: product.id
        }
      });

      await prisma.price.create({
        data: {
          productId: product.id,
          storeProductId: storeProduct.id,
          price: match.price,
          pricePerKg: resolvePricePerKg(product, match),
          pricePerLiter: resolvePricePerLiter(product, match),
          pricePerUnit: resolvePricePerUnit(product, match),
          sourceLabel: match.name ?? null
        }
      });

      summary.matched += 1;
      await sleep(PEDIDOSYA_PRODUCT_DELAY_MS);
    } catch (error) {
      if (isPedidosYaBlockedError(error)) {
        summary.blocked = true;
        summary.message =
          error instanceof Error && error.message === 'PEDIDOSYA_BLOCKED_SET_PEDIDOSYA_COOKIE'
            ? 'PedidosYa está bloqueando el conector. Cargá PEDIDOSYA_COOKIE y reintentá.'
            : 'PedidosYa bloqueó la sesión actual durante el sync. Refrescá la cookie y probá más tarde.';
        break;
      }

      summary.failed += 1;
      console.error(`PedidosYa sync failed for "${product.name}"`, error);
      await sleep(PEDIDOSYA_PRODUCT_DELAY_MS);
    }
  }

  return summary;
}

export async function searchPedidosYa(query: string): Promise<PedidosYaProduct[]> {
  const gotScraping = await loadGotScraping();
  const session = getPedidosYaSession();
  const cookieHeader = session.cookieHeader.trim();
  const response = await gotScraping<PedidosYaSearchResponse>({
    url: PEDIDOSYA_SEARCH_URL,
    searchParams: {
      max: '50',
      offset: '0',
      partnerId: PEDIDOSYA_PARTNER_ID,
      query,
      sort: 'default'
    },
    responseType: 'json',
    headers: {
      accept: 'application/json, text/plain, */*',
      origin: 'https://www.pedidosya.com.uy',
      referer: PEDIDOSYA_REFERER,
      'user-agent': session.userAgent,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      ...(cookieHeader ? { cookie: cookieHeader } : {})
    },
    timeout: {
      request: 30000
    },
    retry: {
      limit: cookieHeader ? 2 : 0
    }
  });

  if (isPedidosYaBlocked(response.body)) {
    throw new Error(
      cookieHeader
        ? 'PEDIDOSYA_BLOCKED_WITH_COOKIE'
        : 'PEDIDOSYA_BLOCKED_SET_PEDIDOSYA_COOKIE'
    );
  }

  return response.body.data ?? [];
}

async function searchPedidosYaForProduct(
  product: CatalogProduct,
  queryCache: Map<string, PedidosYaProduct[]>
): Promise<PedidosYaProduct[]> {
  const terms = buildSearchTerms(product.name, product.brand?.name ?? null, product.aliases ?? []);
  const mergedCandidates = new Map<string, PedidosYaProduct>();

  for (const term of terms) {
    const cacheKey = normalizeText(term);
    const candidates = queryCache.get(cacheKey) ?? (await searchPedidosYa(term));

    if (!queryCache.has(cacheKey)) {
      queryCache.set(cacheKey, candidates);
      await sleep(PEDIDOSYA_QUERY_DELAY_MS);
    }

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

function buildSearchTerms(
  productName: string,
  brandName: string | null,
  aliases: Array<{ alias: string }>
): string[] {
  const normalizedProductKey = stripPackageDescriptor(productName);
  const preferredTerms = PEDIDOSYA_PREFERRED_TERMS[normalizedProductKey];
  if (preferredTerms) {
    return preferredTerms.map((term) => normalizeSearchTerm(term)).filter(Boolean);
  }

  const terms = new Set<string>();
  terms.add(productName);

  const normalizedBrand = normalizeText(brandName ?? '');
  const strippedProductName = stripPackageDescriptor(productName);

  if (brandName) {
    terms.add(`${productName} ${brandName}`);
    terms.add(`${strippedProductName} ${brandName}`.trim());
    terms.add(brandName);
  }

  if (strippedProductName && strippedProductName !== productName) {
    terms.add(strippedProductName);
  }

  for (const extraTerm of PEDIDOSYA_EXTRA_TERMS[stripPackageDescriptor(productName)] ?? []) {
    terms.add(extraTerm);
  }

  for (const alias of aliases.slice(0, 4)) {
    terms.add(alias.alias);
    const strippedAlias = stripPackageDescriptor(alias.alias);
    if (strippedAlias) {
      terms.add(strippedAlias);
      if (normalizedBrand) {
        terms.add(`${strippedAlias} ${normalizedBrand}`);
      }
    }
  }

  if ((productName.includes('huevo') || productName.includes('huevos')) && extractPreferredPackageCount(aliases) !== null) {
    const preferredPackageCount = extractPreferredPackageCount(aliases);
    terms.add(`huevos ${preferredPackageCount}`);
    terms.add(`maple x${preferredPackageCount}`);
  }

  return Array.from(terms).map((term) => normalizeSearchTerm(term)).filter(Boolean).slice(0, PEDIDOSYA_MAX_TERMS);
}

function pickBestPedidosYaMatch(product: CatalogProduct, candidates: PedidosYaProduct[]): PedidosYaProduct | null {
  const forcedMatch = pickForcedPedidosYaMatch(product, candidates);
  if (forcedMatch) {
    return forcedMatch;
  }

  let bestCandidate: PedidosYaProduct | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (!isValidPedidosYaMatch(product, candidate)) {
      continue;
    }

    const score = scorePedidosYaCandidate(product, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function pickForcedPedidosYaMatch(product: CatalogProduct, candidates: PedidosYaProduct[]): PedidosYaProduct | null {
  const productKey = stripPackageDescriptor(product.name);

  if (productKey === 'arroz integral') {
    return (
      candidates.find((candidate) => hasAllTokens(candidate.name ?? '', ['arroz', 'saman', 'integral'])) ?? null
    );
  }

  if (productKey === 'harina') {
    return (
      candidates.find((candidate) => hasAllTokens(candidate.name ?? '', ['harina', 'canuelas', '0000'])) ?? null
    );
  }

  if (productKey === 'harina integral') {
    return (
      candidates.find((candidate) =>
        hasAllTokens(candidate.name ?? '', ['harina', 'canuelas', 'integral']) &&
        (includesAsFullWord(normalizeText(candidate.name ?? ''), '100') ||
          includesAsFullWord(normalizeText(candidate.name ?? ''), '100%'))
      ) ?? null
    );
  }

  if (productKey === 'harina comun') {
    return (
      candidates.find((candidate) => hasAllTokens(candidate.name ?? '', ['harina', 'trigo', 'fortin'])) ?? null
    );
  }

  if (productKey === 'yerba mate compuesta') {
    return (
      candidates.find((candidate) => hasAllTokens(candidate.name ?? '', ['yerba', 'mate', 'compuesta', 'armino', '1'])) ?? null
    );
  }

  if (productKey === 'jabon liquido fresh') {
    return (
      candidates.find((candidate) => hasAllTokens(candidate.name ?? '', ['jabon', 'liquido', 'conejo', 'fresh', '3'])) ?? null
    );
  }

  if (productKey === 'papel higienico higienol max hoja simple 4 u') {
    return (
      candidates.find((candidate) => hasAllTokens(candidate.name ?? '', ['papel', 'higienico', 'higienol', 'max', 'hoja', 'simple', '4'])) ?? null
    );
  }

  return null;
}

function isValidPedidosYaMatch(product: CatalogProduct, candidate: PedidosYaProduct): boolean {
  const normalizedCandidateName = normalizeText(candidate.name ?? '');
  const normalizedProductName = normalizeText(product.name);
  const normalizedProductKey = stripPackageDescriptor(product.name);
  const normalizedBrandName = normalizeText(product.brand?.name ?? '');
  const candidateTokens = buildComparableTokens(candidate.name ?? '');
  const productTokens = buildComparableTokens(product.name);
  const aliasNames = product.aliases?.map((alias) => normalizeText(alias.alias)).filter(Boolean) ?? [];
  const aliasTokenSets = aliasNames.map((alias) => buildComparableTokens(alias));

  if (!normalizedCandidateName || typeof candidate.price !== 'number') {
    return false;
  }

  if (!hasCompatibleMeasurement(product, candidate)) {
    return false;
  }

  if (hasDisallowedTokens(normalizedProductKey, normalizedCandidateName)) {
    return false;
  }

  if (!hasRequiredTokens(normalizedProductKey, normalizedCandidateName)) {
    return false;
  }

  const nameMatches =
    normalizedCandidateName.startsWith(normalizedProductName) ||
    includesAsFullWord(normalizedCandidateName, normalizedProductName) ||
    Array.from(productTokens).every((token) => candidateTokens.has(token)) ||
    aliasNames.some(
      (alias) => normalizedCandidateName.startsWith(alias) || includesAsFullWord(normalizedCandidateName, alias)
    ) ||
    aliasTokenSets.some((aliasTokens) => Array.from(aliasTokens).every((token) => candidateTokens.has(token))) ||
    isEggFamilyMatch(normalizedProductName, normalizedCandidateName);

  if (!nameMatches) {
    return false;
  }

  if (normalizedBrandName && !allowsBrandAgnosticMatch(product.name)) {
    return includesAsFullWord(normalizedCandidateName, normalizedBrandName);
  }

  return true;
}

function scorePedidosYaCandidate(product: CatalogProduct, candidate: PedidosYaProduct): number {
  let score = 0;
  const normalizedCandidateName = normalizeText(candidate.name ?? '');
  const normalizedProductName = normalizeText(product.name);
  const normalizedProductKey = stripPackageDescriptor(product.name);
  const normalizedBrandName = normalizeText(product.brand?.name ?? '');
  const aliasNames = product.aliases?.map((alias) => normalizeText(alias.alias)).filter(Boolean) ?? [];
  const packageSize = extractPackageSize(candidate);
  const packageCount = extractPackageCount(candidate.name ?? '');
  const preferredPackageCount = extractPreferredPackageCount(product.aliases ?? []);

  if (normalizedCandidateName.startsWith(normalizedProductName)) {
    score += 80;
  }

  if (includesAsFullWord(normalizedCandidateName, normalizedProductName)) {
    score += 40;
  }

  if (normalizedBrandName && includesAsFullWord(normalizedCandidateName, normalizedBrandName)) {
    score += 100;
  }

  if (aliasNames.some((alias) => normalizedCandidateName.startsWith(alias) || includesAsFullWord(normalizedCandidateName, alias))) {
    score += 70;
  }

  if (hasRequiredTokens(normalizedProductKey, normalizedCandidateName)) {
    score += 40;
  }

  if (hasPreferredScoreTokens(normalizedProductKey, normalizedCandidateName)) {
    score += 140;
  }

  if (packageSize) {
    const distance = Math.abs(packageSize.value - product.sizeValue);
    score += Math.max(0, 120 - distance * 120);
  }

  if (packageCount !== null && preferredPackageCount !== null) {
    score += Math.max(0, 120 - Math.abs(packageCount - preferredPackageCount) * 12);
  }

  return score;
}

function hasCompatibleMeasurement(product: CatalogProduct, candidate: PedidosYaProduct): boolean {
  const measurementUnit = normalizeMeasurementUnit(candidate.measurement_unit?.short_name);
  const packageSize = extractPackageSize(candidate);

  if (product.baseUnit === ProductUnit.KG) {
    return measurementUnit === 'kg' || packageSize?.unit === 'KG';
  }

  if (product.baseUnit === ProductUnit.LITER) {
    return measurementUnit === 'l' || packageSize?.unit === 'LITER';
  }

  if (product.baseUnit === ProductUnit.UNIT) {
    return (
      measurementUnit === 'un' ||
      extractPackageCount(candidate.name ?? '') !== null ||
      packageSize !== null ||
      isEggFamilyMatch(product.name, candidate.name ?? '')
    );
  }

  return false;
}

async function loadGotScraping(): Promise<
  <T>(options: Record<string, unknown>) => Promise<{ body: T }>
> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<unknown>;
  const module = (await dynamicImport('got-scraping')) as {
    gotScraping: <T>(options: Record<string, unknown>) => Promise<{ body: T }>;
  };

  return module.gotScraping;
}

function isPedidosYaBlocked(body: PedidosYaSearchResponse): boolean {
  return Boolean(body.appId || body.blockScript || body.jsClientSrc);
}

function isPedidosYaBlockedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'PEDIDOSYA_BLOCKED_WITH_COOKIE' || error.message === 'PEDIDOSYA_BLOCKED_SET_PEDIDOSYA_COOKIE')
  );
}

function resolvePricePerKg(product: CatalogProduct, candidate: PedidosYaProduct): number | null {
  if (typeof candidate.price !== 'number') {
    return null;
  }

  const packageSize = extractPackageSize(candidate);
  const measurementUnit = normalizeMeasurementUnit(candidate.measurement_unit?.short_name);
  const canResolveByWeight =
    product.baseUnit === ProductUnit.KG || measurementUnit === 'kg' || packageSize?.unit === 'KG';

  if (!canResolveByWeight) {
    return null;
  }

  if (packageSize?.unit === 'KG') {
    return candidate.price / packageSize.value;
  }

  if (typeof candidate.price_per_measurement_unit === 'number' && measurementUnit === 'kg') {
    return candidate.price_per_measurement_unit;
  }

  return candidate.price / product.sizeValue;
}

function resolvePricePerLiter(product: CatalogProduct, candidate: PedidosYaProduct): number | null {
  if (typeof candidate.price !== 'number') {
    return null;
  }

  const packageSize = extractPackageSize(candidate);
  const measurementUnit = normalizeMeasurementUnit(candidate.measurement_unit?.short_name);
  const canResolveByVolume =
    product.baseUnit === ProductUnit.LITER || measurementUnit === 'l' || packageSize?.unit === 'LITER';

  if (!canResolveByVolume) {
    return null;
  }

  if (packageSize?.unit === 'LITER') {
    return candidate.price / packageSize.value;
  }

  if (typeof candidate.price_per_measurement_unit === 'number' && measurementUnit === 'l') {
    return candidate.price_per_measurement_unit;
  }

  return candidate.price / product.sizeValue;
}

function resolvePricePerUnit(product: CatalogProduct, candidate: PedidosYaProduct): number | null {
  if (product.baseUnit !== ProductUnit.UNIT || typeof candidate.price !== 'number') {
    return null;
  }

  const packageCount = extractPackageCount(candidate.name ?? '');
  return packageCount && packageCount > 0 ? candidate.price / packageCount : candidate.price / product.sizeValue;
}

function normalizeMeasurementUnit(value: string | undefined): string {
  const normalized = normalizeText(value ?? '');

  if (normalized === 'lt' || normalized === 'litro' || normalized === 'litros') {
    return 'l';
  }

  if (normalized === 'unidad' || normalized === 'unidades') {
    return 'un';
  }

  return normalized;
}

function normalizeSearchTerm(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function allowsBrandAgnosticMatch(productName: string): boolean {
  return BRAND_OPTIONAL_PRODUCTS.has(stripPackageDescriptor(productName));
}

function hasDisallowedTokens(productName: string, candidateName: string): boolean {
  return (PEDIDOSYA_DISALLOWED_TOKENS[productName] ?? []).some((token) => includesAsFullWord(candidateName, token));
}

function hasRequiredTokens(productName: string, candidateName: string): boolean {
  const requiredTokens = PEDIDOSYA_REQUIRED_TOKENS[productName] ?? [];
  const requiredAnyTokens = PEDIDOSYA_REQUIRED_ANY_TOKENS[productName] ?? [];

  const hasAllRequired = requiredTokens.every((token) => includesAsFullWord(candidateName, token));
  if (!hasAllRequired) {
    return false;
  }

  if (requiredAnyTokens.length === 0) {
    return true;
  }

  return requiredAnyTokens.some((token) => includesAsFullWord(candidateName, token));
}

function hasPreferredScoreTokens(productName: string, candidateName: string): boolean {
  const preferredTokens = PEDIDOSYA_PREFERRED_SCORE_TOKENS[productName] ?? [];
  if (preferredTokens.length === 0) {
    return false;
  }

  return preferredTokens.every((token) => includesAsFullWord(candidateName, token));
}

function hasAllTokens(candidateName: string, tokens: string[]): boolean {
  const normalizedCandidateName = normalizeText(candidateName);
  return tokens.every((token) => includesAsFullWord(normalizedCandidateName, normalizeText(token)));
}

function stripPackageDescriptor(value: string): string {
  return normalizeText(value.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2'))
    .replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|gr|l|lt|ml)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildComparableTokens(value: string): Set<string> {
  const tokens = normalizeText(value.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2'))
    .split(' ')
    .filter(Boolean)
    .map(normalizeComparableToken);

  return new Set(tokens.filter((token) => token.length > 0));
}

function normalizeComparableToken(token: string): string {
  if (['de', 'del', 'la', 'el', 'los', 'las', 'para'].includes(token)) {
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

  if (token.endsWith('ones') && token.length > 5) {
    return token.slice(0, -2);
  }

  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1);
  }

  if (token === 'comun' || token === '000' || token === '0000') {
    return 'comun';
  }

  return token;
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

function isEggFamilyMatch(productName: string, candidateName: string): boolean {
  const normalizedProductName = normalizeText(productName);
  const normalizedCandidateName = normalizeText(candidateName);

  return (
    (normalizedProductName.includes('huevo') || normalizedProductName.includes('huevos')) &&
    (normalizedCandidateName.includes('huevo') || normalizedCandidateName.includes('huevos'))
  );
}

function extractPackageSize(candidate: PedidosYaProduct): { value: number; unit: 'KG' | 'LITER' } | null {
  const normalizedName = normalizeText(candidate.name ?? '');
  const nameMatch = normalizedName.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|l|lt)\b/);

  if (nameMatch) {
    return convertPackageSize(nameMatch[1], nameMatch[2]);
  }

  if (typeof candidate.content_quantity === 'number' && Number.isFinite(candidate.content_quantity)) {
    const measurementUnit = normalizeMeasurementUnit(candidate.measurement_unit?.short_name);
    if (measurementUnit === 'kg') {
      return { value: candidate.content_quantity / 1000, unit: 'KG' };
    }

    if (measurementUnit === 'l') {
      return { value: candidate.content_quantity / 1000, unit: 'LITER' };
    }
  }

  return null;
}

function convertPackageSize(rawValue: string, rawUnit: string): { value: number; unit: 'KG' | 'LITER' } | null {
  const numericValue = Number.parseFloat(rawValue.replace(',', '.'));
  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (rawUnit === 'kg') {
    return { value: numericValue, unit: 'KG' };
  }

  if (rawUnit === 'g' || rawUnit === 'gr') {
    return { value: numericValue / 1000, unit: 'KG' };
  }

  if (rawUnit === 'l' || rawUnit === 'lt') {
    return { value: numericValue, unit: 'LITER' };
  }

  if (rawUnit === 'ml') {
    return { value: numericValue / 1000, unit: 'LITER' };
  }

  return null;
}

function extractPackageCount(name: string): number | null {
  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalizedName.match(/\b(\d+)\s*(u|un|unidad|unidades)\b/);
  if (!match) {
    return null;
  }

  const count = Number.parseInt(match[1], 10);
  return Number.isNaN(count) ? null : count;
}

function extractPreferredPackageCount(aliases: Array<{ alias: string }>): number | null {
  let preferredCount: number | null = null;

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias.alias);
    const match = normalizedAlias.match(/\b(?:x\s*)?(\d+)\b/);
    if (!match) {
      continue;
    }

    const count = Number.parseInt(match[1], 10);
    if (!Number.isNaN(count) && count > 1) {
      preferredCount = preferredCount === null ? count : Math.max(preferredCount, count);
    }
  }

  return preferredCount;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
