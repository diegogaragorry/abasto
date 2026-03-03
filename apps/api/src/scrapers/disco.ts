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

    await page.waitForSelector('input[placeholder="Busca en Disco"]', {
      timeout: 20000
    });

    await page.fill('input[placeholder="Busca en Disco"]', '');
    await page.fill('input[placeholder="Busca en Disco"]', search);
    await page.waitForTimeout(800);

    if ((await page.locator('.search-result .product-item-suggest').count()) === 0) {
      await page.keyboard.press('Enter');
    }

    await page.waitForFunction(
      () =>
        document.querySelectorAll('.search-result .product-item-suggest').length > 0 ||
        document.querySelectorAll('.product-item').length > 0,
      {
        timeout: 12000
      }
    );
    await page.waitForTimeout(1200);

    const hasSuggestResults = (await page.locator('.search-result .product-item-suggest').count()) > 0;
    const selector = hasSuggestResults ? '.search-result .product-item-suggest' : '.product-item';
    const rawProducts = await page.$$eval(selector, (items) =>
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

    const products = rawProducts.filter((product) => matchesSearch(product.name, search));

    console.log(
      `[disco] extracted ${rawProducts.length} products from ${hasSuggestResults ? 'search overlay' : 'product grid'}, ${products.length} matched search`
    );

    return products;
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
