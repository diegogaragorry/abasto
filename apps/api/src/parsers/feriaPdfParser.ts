import { normalizeText } from '../normalizers/text';

export interface ParsedFeriaLine {
  raw: string;
  rawName: string;
  normalizedName: string;
  quantity: number;
  unit: string | null;
  price: number;
}

interface ParsedFeriaDescriptor {
  raw: string;
  rawName: string;
  normalizedName: string;
  quantity: number;
  unit: string | null;
}

const PRICE_AT_END_PATTERN = /\$\s*([0-9]+(?:[.,][0-9]+)?)\s*$/;
const PRICE_ONLY_PATTERN = /^\$?\s*\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*$/;
const QUANTITY_AND_UNIT_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos|k|un|unidad|unidades|lt|lts|litro|litros|l)\b/i;
const UNIT_ONLY_PATTERN = /\b(kg|kilo|kilos|k|un|unidad|unidades|lt|lts|litro|litros|l)\b/i;

export function parseFeriaPdfText(text: string): ParsedFeriaLine[] {
  const parsedLines: ParsedFeriaLine[] = [];
  const pendingDescriptors: ParsedFeriaDescriptor[] = [];
  const pendingPrices: number[] = [];

  for (const line of text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const parsedInlineLine = parseFeriaLine(line);
    if (parsedInlineLine) {
      parsedLines.push(parsedInlineLine);
      continue;
    }

    const priceOnly = parsePriceOnlyLine(line);
    if (priceOnly !== null) {
      if (pendingDescriptors.length > 0) {
        const descriptor = pendingDescriptors.shift();
        if (descriptor) {
          parsedLines.push({
            ...descriptor,
            price: priceOnly
          });
        }
      } else {
        pendingPrices.push(priceOnly);
      }
      continue;
    }

    const descriptor = parseFeriaDescriptor(line);
    if (descriptor) {
      if (pendingPrices.length > 0) {
        const price = pendingPrices.shift();
        if (price !== undefined) {
          parsedLines.push({
            ...descriptor,
            price
          });
        }
      } else {
        pendingDescriptors.push(descriptor);
      }
      continue;
    }

    if (shouldResetPendingDescriptors(line)) {
      pendingDescriptors.length = 0;
      pendingPrices.length = 0;
    }
  }

  return parsedLines;
}

export function parseFeriaLine(line: string): ParsedFeriaLine | null {
  const cleanedLine = normalizeLine(line);
  const priceMatch = cleanedLine.match(PRICE_AT_END_PATTERN);

  if (!priceMatch || priceMatch.index === undefined) {
    return null;
  }

  const descriptor = parseFeriaDescriptor(cleanedLine.slice(0, priceMatch.index).trim());
  const price = Number.parseFloat(priceMatch[1].replace(',', '.'));

  if (!descriptor || Number.isNaN(price)) {
    return null;
  }

  return {
    ...descriptor,
    price
  };
}

function parseFeriaDescriptor(line: string): ParsedFeriaDescriptor | null {
  const cleanedLine = normalizeLine(line);

  if (!cleanedLine || shouldIgnoreLine(cleanedLine) || !/[a-zA-ZÀ-ÿ]/.test(cleanedLine)) {
    return null;
  }

  const quantityAndUnitMatch = cleanedLine.match(QUANTITY_AND_UNIT_PATTERN);
  const unitOnlyMatch = cleanedLine.match(UNIT_ONLY_PATTERN);

  let quantity = 1;
  let unit: string | null = null;
  let rawName = cleanedLine;

  if (quantityAndUnitMatch) {
    quantity = Number.parseFloat(quantityAndUnitMatch[1].replace(',', '.'));
    unit = quantityAndUnitMatch[2].toLowerCase();
    rawName = cleanedLine.replace(quantityAndUnitMatch[0], ' ');
  } else if (unitOnlyMatch) {
    unit = unitOnlyMatch[1].toLowerCase();
    rawName = cleanedLine.replace(unitOnlyMatch[0], ' ');
  }

  rawName = rawName.replace(/\b(at|c\/u|cu|c\.u)\b/gi, ' ').replace(/\s+/g, ' ').trim();

  if (!rawName || Number.isNaN(quantity) || !/[a-zA-ZÀ-ÿ]/.test(rawName)) {
    return null;
  }

  return {
    raw: line,
    rawName,
    normalizedName: normalizeText(rawName),
    quantity,
    unit
  };
}

function parsePriceOnlyLine(line: string): number | null {
  const match = normalizeLine(line).match(PRICE_ONLY_PATTERN);
  if (!match) {
    return null;
  }

  const price = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isNaN(price) ? null : price;
}

function normalizeLine(line: string): string {
  return line.replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim();
}

function shouldIgnoreLine(line: string): boolean {
  const normalized = normalizeText(line);

  return (
    normalized.startsWith('@') ||
    normalized.startsWith('--') ||
    normalized === 'huevos' ||
    normalized === 'otros' ||
    normalized === 'granos' ||
    normalized.includes('envios minimo') ||
    normalized.includes('validas nuestro') ||
    normalized.includes('unico local en el') ||
    normalized.includes('a domicilio') ||
    normalized.includes('listado de precios') ||
    /^[a-z]\s(?:[a-z]\s)+[a-z]$/i.test(normalized)
  );
}

function shouldResetPendingDescriptors(line: string): boolean {
  const normalized = normalizeText(line);
  return normalized.startsWith('--') || normalized.includes('envios minimo') || normalized.includes('listado de precios');
}
