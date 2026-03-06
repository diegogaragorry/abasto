import { chromium, type Browser, type Page } from 'playwright';
import { normalizeText } from '../normalizers/text';

export type DiscoProduct = {
  name: string;
  price: string;
  link: string;
};

export async function scrapeDisco(search: string): Promise<DiscoProduct[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await createDiscoPage(browser);
    return await scrapeDiscoWithPage(page, search);
  } finally {
    await browser.close();
  }
}

export async function withDiscoPage<T>(callback: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await createDiscoPage(browser);
    return await callback(page);
  } finally {
    await browser.close();
  }
}

export async function scrapeDiscoWithPage(page: Page, search: string): Promise<DiscoProduct[]> {
  try {
    console.log(`[disco] searching: ${search}`);
    const searchUrl = buildSearchUrl(search);
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    await page.waitForFunction(
      () => document.querySelectorAll('.product-item').length > 0 || document.body.innerText.includes('No se encontraron'),
      { timeout: 12000 }
    ).catch(() => undefined);
    await page.waitForTimeout(1500);

    const rawProducts = await extractProducts(page, '.product-item');
    const products = rawProducts.filter((product) => matchesSearch(product.name, search));

    console.log(`[disco] extracted ${rawProducts.length} products from search results page, ${products.length} matched search`);

    if (products.length > 0 || rawProducts.length === 0) {
      return products;
    }

    // Fallback for result pages that degrade back to the home grid.
    return await scrapeDiscoFromHomeWidget(page, search);
  } catch (error) {
    console.error('[disco] scrape failed', error);
    throw error;
  }
}

async function createDiscoPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.goto('https://www.disco.com.uy', {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });
  await page.waitForSelector('input[placeholder="Busca en Disco"]', {
    timeout: 20000
  });
  return page;
}

async function scrapeDiscoFromHomeWidget(page: Page, search: string): Promise<DiscoProduct[]> {
  await page.goto('https://www.disco.com.uy', {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });
  await page.waitForSelector('input[placeholder="Busca en Disco"]', {
    timeout: 20000
  });

  await page.evaluate((value) => {
    const input = document.querySelector('#InputSearch') as HTMLInputElement | null;
    if (!input) {
      return;
    }

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: value.at(-1) ?? 'a', bubbles: true }));
  }, search);

  await page.waitForTimeout(1200);

  const submitButton = page.locator('form.search-widget button[type="submit"]');
  if (!(await submitButton.isDisabled().catch(() => true))) {
    await submitButton.click();
    await page.waitForTimeout(2000);
  }

  const rawProducts = await extractProducts(page, '.search-result .product-item-suggest, .product-item');
  const products = rawProducts.filter((product) => matchesSearch(product.name, search));

  console.log(`[disco] fallback extracted ${rawProducts.length} products, ${products.length} matched search`);

  return products;
}

async function extractProducts(page: Page, selector: string): Promise<DiscoProduct[]> {
  return await page.$$eval(selector, (items) =>
    items.map((item) => {
      const name =
        item.querySelector('.prod-desc h3 a, .desc-top h3 a, h3 a, h3')?.textContent?.trim() || '';
      const price =
        item.querySelector('.price .val, .price, .prod-price')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const anchor = item.querySelector('.prod-desc h3 a, .desc-top h3 a, h3 a, figure a') as HTMLAnchorElement | null;
      const link = anchor?.href || '';

      return { name, price, link };
    })
  );
}

function buildSearchUrl(search: string): string {
  return `https://www.disco.com.uy/productos/keyword/${encodeURIComponent(search)}`;
}

function matchesSearch(productName: string, search: string): boolean {
  const candidateTokens = buildComparableTokens(productName);
  const searchTokens = buildComparableTokens(search);

  if (searchTokens.size === 0) {
    return false;
  }

  return Array.from(searchTokens).every((token) => candidateTokens.has(token));
}

function buildComparableTokens(value: string): Set<string> {
  const tokens = normalizeText(value.replace(/(\d)([a-z])/gi, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2'))
    .split(' ')
    .filter(Boolean)
    .map((token) => normalizeComparableToken(token))
    .filter(Boolean);

  return new Set(tokens);
}

function normalizeComparableToken(token: string): string {
  if (['de', 'del', 'la', 'el', 'los', 'las', 'para'].includes(token)) {
    return '';
  }

  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}
