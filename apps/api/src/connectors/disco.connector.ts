import { ProductUnit, StoreType } from '@prisma/client';
import { decodeMojibake, normalizeText } from '../normalizers/text';
import { scrapeDiscoWithPage, withDiscoPage } from '../scrapers/disco';
import { prisma } from '../services/prisma';

const DISCO_STORE_NAME = 'Disco';
const DISCO_GENERIC_NEGATIVE_TOKENS = [
  'barrita',
  'gomita',
  'yogur',
  'yogurt',
  'cereal',
  'galleta',
  'bebida',
  'jugo',
  'mayonesa',
  'salsa',
  'aderezo',
  'budin',
  'alfajor',
  'helado',
  'mermelada',
  'snack',
  'caramelo',
  'chocolate',
  'postre'
] as const;
const DISCO_SEARCH_TIMEOUT_MS = 25_000;

export async function syncDiscoPrices() {
  const discoStore = await prisma.store.upsert({
    where: { name: DISCO_STORE_NAME },
    update: { type: StoreType.SUPERMARKET },
    create: {
      name: DISCO_STORE_NAME,
      type: StoreType.SUPERMARKET
    }
  });

  const products = await prisma.product.findMany({
    include: { brand: true, aliases: true },
    orderBy: { id: 'asc' }
  });

  const summary = {
    processed: 0,
    matched: 0,
    skipped: 0,
    failed: 0
  };

  await withDiscoPage(async (page) => {
    for (const product of products) {
      summary.processed += 1;

      try {
        const candidates = await searchDiscoProductsForProduct(page, product);
        const match = pickBestDiscoMatch(product, candidates);

        if (!match) {
          summary.skipped += 1;
          continue;
        }

        const price = parseDiscoPrice(match.price);
        if (price === null) {
          summary.skipped += 1;
          continue;
        }

        const storeProduct = await prisma.storeProduct.upsert({
          where: {
            storeId_productId: {
              storeId: discoStore.id,
              productId: product.id
            }
          },
          update: {},
          create: {
            storeId: discoStore.id,
            productId: product.id
          }
        });

        await prisma.price.create({
          data: {
            productId: product.id,
            storeProductId: storeProduct.id,
            price,
            pricePerKg: resolvePricePerKg(product, match, price),
            pricePerLiter: resolvePricePerLiter(product, match, price),
            pricePerUnit: resolvePricePerUnit(product, match, price),
            sourceLabel: match.name
          }
        });

        summary.matched += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(`Disco sync failed for "${product.name}"`, error);
      }
    }
  });

  return summary;
}

type DiscoCandidate = {
  name: string;
  price: string;
  link: string;
};

async function searchDiscoProductsForProduct(page: Parameters<typeof scrapeDiscoWithPage>[0], product: {
  name: string;
  brand?: { name: string } | null;
  aliases?: Array<{ alias: string }>;
}) {
  const terms = buildSearchTerms(product.name, product.brand?.name ?? null, product.aliases ?? []);
  const merged = new Map<string, DiscoCandidate>();

  for (const term of terms) {
    let results: DiscoCandidate[] = [];

    try {
      results = await withTimeout(
        scrapeDiscoWithPage(page, term),
        DISCO_SEARCH_TIMEOUT_MS,
        `Disco search timeout for term "${term}"`
      );
    } catch (error) {
      console.warn(`Disco search skipped for "${product.name}" with term "${term}"`, error);
      continue;
    }

    for (const result of results) {
      const key = normalizeText(result.name);
      if (!key || merged.has(key)) {
        continue;
      }
      merged.set(key, result);
    }
  }

  return Array.from(merged.values());
}

function buildSearchTerms(productName: string, brandName: string | null, aliases: Array<{ alias: string }>) {
  const terms = new Set<string>();
  terms.add(productName);

  if (brandName) {
    terms.add(`${productName} ${brandName}`);
    terms.add(brandName);
  }

  const stripped = stripPackageDescriptor(productName);
  if (stripped && stripped !== productName) {
    terms.add(stripped);
    if (brandName) {
      terms.add(`${stripped} ${brandName}`);
    }
  }

  for (const alias of aliases.slice(0, 3)) {
    terms.add(alias.alias);
  }

  for (const extraTerm of getExtraDiscoSearchTerms(productName, brandName)) {
    terms.add(extraTerm);
  }

  return Array.from(terms).filter((term) => term.trim().length > 0);
}

function pickBestDiscoMatch(
  product: {
    name: string;
    baseUnit: ProductUnit;
    sizeValue: number;
    brand?: { name: string } | null;
    aliases?: Array<{ alias: string }>;
  },
  candidates: DiscoCandidate[]
) {
  let bestMatch: DiscoCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (!isValidDiscoMatch(product, candidate)) {
      continue;
    }

    const score = scoreDiscoCandidate(product, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

function isValidDiscoMatch(
  product: {
    name: string;
    baseUnit: ProductUnit;
    sizeValue: number;
    brand?: { name: string } | null;
    aliases?: Array<{ alias: string }>;
  },
  candidate: DiscoCandidate
) {
  const candidateName = normalizeText(candidate.name);
  const rules = getDiscoRules(product);
  const productTokens = buildComparableTokens(product.name);
  const candidateTokens = buildComparableTokens(candidate.name);
  const brandName = normalizeText(product.brand?.name ?? '');
  const aliasTokenSets = (product.aliases ?? []).map((alias) => buildComparableTokens(alias.alias));

  const nameMatches =
    Array.from(productTokens).every((token) => candidateTokens.has(token)) ||
    aliasTokenSets.some((tokenSet) => Array.from(tokenSet).every((token) => candidateTokens.has(token))) ||
    (rules.requiredTokens?.length ?? 0) > 0;

  if (!nameMatches) {
    return false;
  }

  if (rules.requiredTokens && !rules.requiredTokens.every((token) => hasComparableToken(candidateTokens, token))) {
    return false;
  }

  if (rules.requiredOneOf && !rules.requiredOneOf.some((token) => hasComparableToken(candidateTokens, token))) {
    return false;
  }

  if (rules.disallowedTokens?.some((token) => hasComparableToken(candidateTokens, token))) {
    return false;
  }

  if (brandName && !candidateName.includes(brandName)) {
    return false;
  }

  if (!hasCompatibleMeasurement(product, candidate)) {
    return false;
  }

  if (rules.requiredPackageSize !== undefined) {
    const packageSize = extractPackageSize(candidate.name);
    if (!packageSize || Math.abs(packageSize.value - rules.requiredPackageSize) > 0.01) {
      return false;
    }
  }

  if (rules.requiredPackageCount !== undefined) {
    const packageCount = extractPackageCount(candidate.name);
    if (packageCount !== rules.requiredPackageCount) {
      return false;
    }
  }

  return true;
}

function scoreDiscoCandidate(
  product: {
    name: string;
    baseUnit: ProductUnit;
    sizeValue: number;
    brand?: { name: string } | null;
  },
  candidate: DiscoCandidate
) {
  let score = 0;
  const candidateName = normalizeText(candidate.name);
  const productName = normalizeText(product.name);
  const brandName = normalizeText(product.brand?.name ?? '');
  const candidateTokens = buildComparableTokens(candidate.name);
  const rules = getDiscoRules(product);

  if (candidateName.startsWith(productName)) {
    score += 100;
  }

  if (brandName && candidateName.includes(brandName)) {
    score += 80;
  }

  if (rules.preferredTokens) {
    score += rules.preferredTokens.filter((token) => hasComparableToken(candidateTokens, token)).length * 20;
  }

  const packageSize = extractPackageSize(candidate.name);
  if (packageSize) {
    score += Math.max(0, 100 - Math.abs(packageSize.value - product.sizeValue) * 100);
  }

  const packageCount = extractPackageCount(candidate.name);
  if (packageCount) {
    score += Math.max(0, 80 - Math.abs(packageCount - product.sizeValue) * 20);
  }

  return score;
}

function parseDiscoPrice(value: string): number | null {
  const matches = Array.from(value.matchAll(/\d+(?:[.,]\d+)?/g)).map((match) =>
    Number.parseFloat(match[0].replace(/\./g, '').replace(',', '.'))
  );
  const numeric = matches.at(-1);
  return numeric === undefined || Number.isNaN(numeric) ? null : numeric;
}

function hasCompatibleMeasurement(
  product: { name: string; baseUnit: ProductUnit; sizeValue: number },
  candidate: DiscoCandidate
) {
  const packageSize = extractPackageSize(candidate.name);
  const packageCount = extractPackageCount(candidate.name);

  if (product.baseUnit === ProductUnit.KG) {
    return packageSize?.unit === 'KG' || packageSize === null;
  }

  if (product.baseUnit === ProductUnit.LITER) {
    if (isYogurtLikeProduct(product.name) && packageSize?.unit === 'KG') {
      return areComparablePackageSizes(packageSize.value, product.sizeValue);
    }
    return packageSize?.unit === 'LITER' || (packageCount !== null && packageCount === product.sizeValue);
  }

  if (product.baseUnit === ProductUnit.UNIT) {
    return true;
  }

  return false;
}

function resolvePricePerKg(
  product: { baseUnit: ProductUnit; sizeValue: number },
  candidate: DiscoCandidate,
  price: number
) {
  if (product.baseUnit !== ProductUnit.KG) {
    return null;
  }

  const packageSize = extractPackageSize(candidate.name);
  if (packageSize?.unit === 'KG') {
    return price / packageSize.value;
  }

  return product.sizeValue > 0 ? price / product.sizeValue : price;
}

function resolvePricePerLiter(
  product: { name: string; baseUnit: ProductUnit; sizeValue: number },
  candidate: DiscoCandidate,
  price: number
) {
  if (product.baseUnit !== ProductUnit.LITER) {
    return null;
  }

  const packageSize = extractPackageSize(candidate.name);
  if (packageSize?.unit === 'LITER') {
    return price / packageSize.value;
  }

  if (isYogurtLikeProduct(product.name) && packageSize?.unit === 'KG') {
    return price / packageSize.value;
  }

  const packageCount = extractPackageCount(candidate.name);
  if (packageCount && product.sizeValue > 0 && packageCount === product.sizeValue) {
    return price / product.sizeValue;
  }

  return product.sizeValue > 0 ? price / product.sizeValue : price;
}

function resolvePricePerUnit(
  product: { baseUnit: ProductUnit; sizeValue: number },
  candidate: DiscoCandidate,
  price: number
) {
  if (product.baseUnit !== ProductUnit.UNIT) {
    return null;
  }

  const packageCount = extractPackageCount(candidate.name);
  if (packageCount && packageCount > 0) {
    return price / packageCount;
  }

  return product.sizeValue > 0 ? price / product.sizeValue : price;
}

function stripPackageDescriptor(value: string) {
  return normalizeText(value.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2'))
    .replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|gr|l|lt|ml)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildComparableTokens(value: string) {
  return new Set(
    normalizeText(value.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2'))
      .split(' ')
      .filter(Boolean)
      .map((token) => normalizeComparableToken(token))
      .filter(Boolean)
  );
}

function hasComparableToken(candidateTokens: Set<string>, token: string) {
  const comparableTokens = Array.from(buildComparableTokens(token));
  return comparableTokens.length > 0 && comparableTokens.every((comparableToken) => candidateTokens.has(comparableToken));
}

function areComparablePackageSizes(left: number, right: number) {
  return Math.abs(left - right) <= 0.08;
}

function isYogurtLikeProduct(value: string) {
  const normalized = normalizeText(value);
  return normalized.startsWith('yogur') || normalized.startsWith('yogurt');
}

function normalizeComparableToken(token: string) {
  if (['de', 'del', 'la', 'el', 'los', 'las', 'para'].includes(token)) {
    return '';
  }

  if (token === 'yogurt') {
    return 'yogur';
  }

  if (token === 'comun' || token === '000' || token === '0000') {
    return 'comun';
  }

  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}

function extractPackageSize(name: string): { value: number; unit: 'KG' | 'LITER' } | null {
  const normalized = normalizeMeasurementText(name.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2'));
  const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|cc|l|lt)\b/);

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
  if (rawUnit === 'ml' || rawUnit === 'cc') {
    return { value: rawValue / 1000, unit: 'LITER' };
  }

  return null;
}

function extractPackageCount(name: string): number | null {
  const normalized = normalizeMeasurementText(name);
  const match = normalized.match(/\b(\d+)\s*(u|un|un\.|unidad|unidades|x)\b/);
  if (!match) {
    return null;
  }

  const count = Number.parseInt(match[1], 10);
  return Number.isNaN(count) ? null : count;
}

function getDiscoRules(product: {
  name: string;
  brand?: { name: string } | null;
  baseUnit: ProductUnit;
}) {
  const normalizedName = resolveDiscoProductKey(product.name);
  const brandName = normalizeText(product.brand?.name ?? '');
  const rules: {
    requiredTokens?: string[];
    requiredOneOf?: string[];
    preferredTokens?: string[];
    disallowedTokens?: string[];
    requiredPackageSize?: number;
    requiredPackageCount?: number;
  } = {
    preferredTokens: [],
    disallowedTokens: []
  };

  if (!brandName && (product.baseUnit === ProductUnit.KG || product.baseUnit === ProductUnit.UNIT)) {
    rules.disallowedTokens?.push(...DISCO_GENERIC_NEGATIVE_TOKENS);
  }

  if (normalizedName === 'banana') {
    rules.preferredTokens?.push('organica', 'colombia', 'fresh', 'market');
    rules.disallowedTokens?.push('trolli', 'barrita', 'gomita', 'yogur', 'yogurt');
  }

  if (normalizedName === 'bolsas de residuos') {
    rules.requiredTokens = ['bolsa', 'residuos'];
    rules.preferredTokens?.push('50', '60');
    rules.disallowedTokens?.push('mascota', 'mascotas');
  }

  if (normalizedName === 'tomate') {
    rules.disallowedTokens?.push(
      'frito',
      'salsa',
      'pure',
      'pelado',
      'entero',
      'lata',
      'seco',
      'cubeteado',
      'triturado',
      'mutti',
      'conserva',
      'cherry'
    );
  }

  if (normalizedName === 'bidon agua') {
    rules.requiredTokens = ['agua', 'salus'];
    rules.preferredTokens?.push('bidon');
    rules.disallowedTokens?.push('caramanola', 'vaso', 'botella');
    rules.requiredPackageSize = 6.25;
  }

  if (normalizedName === 'aceite de coco terra verde 475ml') {
    rules.requiredTokens = ['aceite', 'coco', 'terra', 'verde'];
    rules.preferredTokens?.push('organico', 'extra', 'virgen', '475', 'cc');
    rules.requiredPackageSize = 0.475;
  }

  if (normalizedName === 'harina') {
    rules.requiredTokens = ['harina', 'canuelas'];
    rules.disallowedTokens?.push('integral', 'avena', 'almendra', 'maiz', 'arroz', 'preparado', 'leudante');
    rules.requiredPackageSize = 1;
  }

  if (normalizedName === 'harina comun 1kg') {
    rules.requiredTokens = ['harina'];
    rules.preferredTokens?.push('precio', 'lider', 'comun');
    rules.disallowedTokens?.push('avena', 'almendra', 'maiz', 'arroz', 'integral', 'preparado');
    rules.requiredPackageSize = 1;
  }

  if (normalizedName === 'harina integral') {
    rules.requiredTokens = ['harina', 'integral', 'canuelas'];
    rules.disallowedTokens?.push('avena', 'almendra', 'maiz', 'arroz', 'preparado');
    rules.requiredPackageSize = 1;
  }

  if (normalizedName === 'yerba mate compuesta 1kg') {
    rules.requiredTokens = ['yerba', 'compuesta'];
    rules.preferredTokens?.push('armino');
    rules.requiredPackageSize = 1;
  }

  if (normalizedName === 'jabon liquido fresh') {
    rules.requiredTokens = ['jabon', 'liquido', 'fresh', 'conejo'];
    rules.preferredTokens?.push('lavar', 'ropa');
    rules.requiredPackageSize = 3;
    rules.disallowedTokens?.push('doypack', 'suavizante');
  }

  if (normalizedName === 'papel higienico higienol max hoja simple 4 u') {
    rules.requiredTokens = ['papel', 'higienico', 'higienol', 'max'];
    rules.preferredTokens?.push('simple');
    rules.requiredPackageCount = 4;
  }

  if (normalizedName === 'brocoli congelado') {
    rules.requiredTokens = ['brocoli'];
    rules.requiredOneOf = ['artico', 'friomix', 'congelado', 'congelados', 'mc cain'];
    rules.preferredTokens?.push('artico', 'friomix', 'congelado', 'mc cain');
    rules.disallowedTokens?.push('ensalada', 'fresco');
  }

  if (normalizedName === 'espinaca congelada') {
    rules.requiredTokens = ['espinaca'];
    rules.requiredOneOf = ['mccain', 'mc cain', 'congelada', 'congelado'];
    rules.preferredTokens?.push('mccain', 'mc cain', 'congelada');
    rules.disallowedTokens?.push('fresca', 'hoja');
  }

  if (normalizedName === 'calabacin') {
    rules.requiredTokens = ['calabacin'];
    rules.disallowedTokens?.push('cubos', 'congelado', 'congelados');
    rules.preferredTokens?.push('aprox');
    rules.requiredPackageSize = 1.5;
  }

  if (normalizedName === 'cebolla blanca') {
    rules.requiredTokens = ['cebolla'];
    rules.disallowedTokens?.push('roja', 'morada', 'colorada', 'congelada', 'aros', 'anillos', 'verdeo');
    rules.preferredTokens?.push('organica', 'especial');
  }

  if (normalizedName === 'morron rojo') {
    rules.requiredTokens = ['morron', 'rojo'];
    rules.preferredTokens?.push('especial');
    rules.requiredPackageSize = 0.2;
  }

  if (normalizedName === 'morron verde') {
    rules.requiredTokens = ['morron', 'verde'];
    rules.preferredTokens?.push('especial');
    rules.requiredPackageSize = 0.2;
  }

  if (normalizedName === 'pepino') {
    rules.requiredTokens = ['pepino'];
    rules.disallowedTokens?.push('encurtido', 'vinagre', 'dulce', 'dulces', 'rodajas', 'japones', 'paulsen');
    rules.preferredTokens?.push('aprox');
    rules.requiredPackageSize = 0.25;
  }

  if (normalizedName === 'zanahoria') {
    rules.requiredTokens = ['zanahoria'];
    rules.preferredTokens?.push('bolsita');
    rules.disallowedTokens?.push('rallada', 'baby', 'congelada', 'cubos');
    rules.requiredPackageSize = 1;
  }

  if (normalizedName === 'zapallito') {
    rules.requiredTokens = ['zapallito'];
    rules.disallowedTokens?.push('tarta', 'tartita', 'relleno', 'congelado', 'tiras');
    rules.requiredPackageSize = 0.25;
  }

  if (normalizedName === 'zucchini') {
    rules.requiredTokens = ['zucchini'];
    rules.disallowedTokens?.push('semilla', 'semillas', 'sobre', 'quintero', 'zuccini');
  }

  if (normalizedName === 'durazno') {
    rules.requiredTokens = ['durazno'];
    rules.disallowedTokens?.push('almibar', 'mermelada', 'yogur', 'yogurt', 'postre', 'lata');
  }

  if (normalizedName === 'pera') {
    rules.requiredTokens = ['pera'];
    rules.disallowedTokens?.push('jabon', 'budin', 'mermelada', 'postre', 'almibar', 'lata');
  }

  if (normalizedName === 'sandia') {
    rules.requiredTokens = ['sandia'];
    rules.disallowedTokens?.push('gomita', 'gomitas', 'cubos', 'cubo', 'pote', 'yummy');
  }

  if (normalizedName === 'melon') {
    rules.requiredTokens = ['melon'];
    rules.preferredTokens?.push('escrito');
    rules.disallowedTokens?.push('helado', 'yogur', 'yogurt');
    rules.requiredPackageSize = 1.5;
  }

  if (normalizedName === 'naranja') {
    rules.requiredTokens = ['naranja'];
    rules.preferredTokens?.push('importada', 'malla');
    rules.disallowedTokens?.push('jugo', 'gaseosa', 'polvo', 'barra');
  }

  if (normalizedName === 'leche de almendras sin azucar') {
    rules.requiredTokens = ['silk', 'sin', 'azucar'];
    rules.requiredOneOf = ['almendra', 'almendras'];
    rules.preferredTokens?.push('bebida', 'leche');
    rules.disallowedTokens?.push('vainilla', 'chocolate');
    rules.requiredPackageSize = 1;
  }

  if (normalizedName === 'leche descremada') {
    rules.requiredTokens = ['leche', 'descremada', 'conaprole'];
    rules.preferredTokens?.push('larga', 'vida');
    rules.requiredPackageSize = 1;
  }

  if (normalizedName === 'yogur deslactosado') {
    rules.requiredTokens = ['yogur', 'ser', 'deslactosado'];
    rules.preferredTokens?.push('natural');
  }

  if (normalizedName === 'yogurt integral') {
    rules.requiredTokens = ['yogur', 'integral', 'conaprole'];
    rules.preferredTokens?.push('natural');
    rules.requiredPackageSize = 0.5;
  }

  if (normalizedName === 'arandanos') {
    rules.requiredTokens = ['arandanos'];
    rules.requiredOneOf = ['petaca', 'bandeja'];
    rules.disallowedTokens?.push('deshidratado', 'deshidratados', 'congelado', 'congelados');
  }

  if (normalizedName === 'huevos colorados') {
    rules.requiredTokens = ['huevo', 'colorado'];
    rules.preferredTokens?.push('docena');
  }

  return rules;
}

function normalizeMeasurementText(value: string): string {
  return decodeMojibake(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getExtraDiscoSearchTerms(productName: string, brandName: string | null): string[] {
  const normalizedName = resolveDiscoProductKey(productName);
  const normalizedBrand = normalizeText(brandName ?? '');

  const extraTerms: Record<string, string[]> = {
    'aceite de coco terra verde 475ml': [
      'aceite de coco',
      'aceite de coco organico terra verde 475 cc',
      'aceite de coco terra verde 475 cc'
    ],
    'bidon agua': ['agua salus', 'agua bidon salus', 'agua salus bidon 6.25 l', 'bidon agua salus 6.25 l'],
    harina: ['harina canuelas'],
    'harina comun 1kg': ['harina precio lider'],
    'harina integral': ['harina integral canuelas'],
    'yerba mate compuesta 1kg': ['yerba compuesta armino'],
    'jabon liquido fresh': ['jabon liquido conejo fresh 3 l', 'jabon liquido para lavar ropa conejo fresh'],
    'brocoli congelado': ['brocoli artico', 'brocoli friomix', 'brocoli congelado', 'brocoli mc cain 500 g', 'brocoli'],
    'espinaca congelada': ['espinaca mccain', 'espinaca mc cain 500 g', 'espinaca congelada', 'espinaca'],
    'cebolla blanca': ['cebolla organica', 'cebolla organica x kg', 'cebolla blanca', 'cebolla especial'],
    'morron rojo': ['morron rojo especial'],
    'morron verde': ['morron verde especial'],
    pepino: ['pepino aprox'],
    zanahoria: ['zanahoria bolsita'],
    zapallito: ['zapallito aprox'],
    melon: ['melon escrito'],
    naranja: ['naranja importada malla'],
    arandanos: ['arandanos petaca', 'arandanos bandeja'],
    'leche de almendras sin azucar': [
      'leche de almendras',
      'silk leche almendras',
      'bebida silk almendra sin azucar',
      'bebida silk almendra sin azucar 1 l'
    ],
    'leche descremada': ['leche descremada conaprole'],
    'yogur deslactosado': ['yogur ser deslactosado natural', 'ser deslactosado natural'],
    'yogurt integral': [
      'yogur integral conaprole natural',
      'yogur conaprole integral 500 g',
      'yogur conaprole',
      'yogur integral',
      'conaprole integral natural 500 ml'
    ],
    'bolsas de residuos': ['bolsas residuos jupiter 50 x 60'],
    'papel higienico higienol max hoja simple 4 u': ['papel higienico higienol max hoja simple 4 unidades', 'higienol max 4 un', 'papel higienico higienol max']
  };

  const terms = [...(extraTerms[normalizedName] ?? [])];
  if (normalizedBrand && normalizedName) {
    terms.push(`${normalizedBrand} ${normalizedName}`);
  }

  return terms;
}

function resolveDiscoProductKey(value: string) {
  const normalized = normalizeText(value);

  if (normalized.startsWith('aceite de coco terra verde')) {
    return 'aceite de coco terra verde 475ml';
  }

  if (normalized.startsWith('bidon agua')) {
    return 'bidon agua';
  }

  if (normalized === 'harina' || normalized.startsWith('harina canuelas')) {
    return 'harina';
  }

  if (normalized.startsWith('harina integral')) {
    return 'harina integral';
  }

  if (normalized.startsWith('yogur deslactosado natural')) {
    return 'yogur deslactosado';
  }

  if (normalized.startsWith('yogurt integral') || normalized.startsWith('yogur integral')) {
    return 'yogurt integral';
  }

  return normalized;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
