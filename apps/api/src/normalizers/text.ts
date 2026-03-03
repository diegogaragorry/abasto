export function decodeMojibake(value: string): string {
  return value
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã/g, 'í');
}

export function normalizeText(value: string): string {
  return decodeMojibake(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\b(kg|kilo|kilos|k|un|unidad|unidades|lt|lts|litro|litros|l)\b/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
