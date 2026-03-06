import { chromium } from 'playwright';

const PEDIDOSYA_HOME_URL = 'https://www.pedidosya.com.uy/';
const DEFAULT_PEDIDOSYA_SEARCH_URL =
  process.env.PEDIDOSYA_SEARCH_URL?.trim() ||
  'https://www.pedidosya.com.uy/groceries/web/v1/catalogues/306090/search?max=50&offset=0&partnerId=286802&query=banana&sort=default';
const DEFAULT_PEDIDOSYA_SEARCH_REFERER =
  process.env.PEDIDOSYA_SEARCH_REFERER?.trim() || PEDIDOSYA_HOME_URL;
const AUTO_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

export type PedidosYaSessionSource = 'env' | 'manual' | 'auto' | 'none';

export type PedidosYaSessionState = {
  cookieHeader: string;
  userAgent: string;
  searchUrl: string;
  searchReferer: string;
  searchTemplateSource: 'default' | 'env' | 'manual';
  source: PedidosYaSessionSource;
  updatedAt: string | null;
  lastAutoRefreshAt: string | null;
  lastAutoRefreshError: string | null;
};

const DEFAULT_USER_AGENT =
  process.env.PEDIDOSYA_USER_AGENT ??
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const state: PedidosYaSessionState = {
  cookieHeader: process.env.PEDIDOSYA_COOKIE?.trim() ?? '',
  userAgent: DEFAULT_USER_AGENT,
  searchUrl: DEFAULT_PEDIDOSYA_SEARCH_URL,
  searchReferer: DEFAULT_PEDIDOSYA_SEARCH_REFERER,
  searchTemplateSource: process.env.PEDIDOSYA_SEARCH_URL?.trim() ? 'env' : 'default',
  source: process.env.PEDIDOSYA_COOKIE?.trim() ? 'env' : 'none',
  updatedAt: process.env.PEDIDOSYA_COOKIE?.trim() ? new Date().toISOString() : null,
  lastAutoRefreshAt: null,
  lastAutoRefreshError: null
};

export function getPedidosYaSession(): PedidosYaSessionState {
  return { ...state };
}

export function updatePedidosYaSession(input: {
  cookieText: string;
  userAgent?: string | null;
  requestText?: string | null;
}) {
  const hasCookieInput = input.cookieText.trim().length > 0;
  const cookieHeader = hasCookieInput ? parseCookieHeader(input.cookieText) : state.cookieHeader;
  const searchTemplate = parseSearchTemplate(input.requestText ?? '');

  state.cookieHeader = cookieHeader;

  if (searchTemplate) {
    state.searchUrl = searchTemplate.url;
    state.searchReferer = searchTemplate.referer;
    state.searchTemplateSource = 'manual';
  }

  if (input.userAgent && input.userAgent.trim().length > 0) {
    state.userAgent = input.userAgent.trim();
  }

  const hasManualState = state.cookieHeader.trim().length > 0 || searchTemplate !== null;
  state.source = hasManualState ? 'manual' : state.cookieHeader.trim().length > 0 ? state.source : 'none';
  state.updatedAt = hasManualState ? new Date().toISOString() : state.updatedAt;

  return getPedidosYaSession();
}

export function clearPedidosYaSession() {
  state.cookieHeader = '';
  state.userAgent = DEFAULT_USER_AGENT;
  state.searchUrl = DEFAULT_PEDIDOSYA_SEARCH_URL;
  state.searchReferer = DEFAULT_PEDIDOSYA_SEARCH_REFERER;
  state.searchTemplateSource = process.env.PEDIDOSYA_SEARCH_URL?.trim() ? 'env' : 'default';
  state.source = 'none';
  state.updatedAt = null;
  state.lastAutoRefreshError = null;
}

export function buildPedidosYaSearchRequest(query: string): {
  url: string;
  origin: string;
  referer: string;
} {
  const url = new URL(state.searchUrl || DEFAULT_PEDIDOSYA_SEARCH_URL);
  url.searchParams.set('query', query);
  if (!url.searchParams.has('max')) {
    url.searchParams.set('max', '50');
  }
  if (!url.searchParams.has('offset')) {
    url.searchParams.set('offset', '0');
  }
  if (!url.searchParams.has('sort')) {
    url.searchParams.set('sort', 'default');
  }

  return {
    url: url.toString(),
    origin: url.origin,
    referer: state.searchReferer || DEFAULT_PEDIDOSYA_SEARCH_REFERER
  };
}

export async function refreshPedidosYaSessionWithPlaywright(options?: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<PedidosYaSessionState> {
  const now = Date.now();
  const force = options?.force ?? false;
  const timeoutMs = options?.timeoutMs ?? 45000;
  const lastRefreshAt = state.lastAutoRefreshAt ? new Date(state.lastAutoRefreshAt).getTime() : null;

  if (!force && lastRefreshAt !== null && now - lastRefreshAt < AUTO_REFRESH_COOLDOWN_MS) {
    return getPedidosYaSession();
  }

  state.lastAutoRefreshAt = new Date(now).toISOString();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent: state.userAgent
    });
    const page = await context.newPage();

    await page.goto(PEDIDOSYA_HOME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    });

    await page.waitForTimeout(2500);

    const warmupUrl = buildPedidosYaSearchRequest('banana').url;

    await page.evaluate(async (url) => {
      try {
        await fetch(url, {
          credentials: 'include',
          headers: {
            accept: 'application/json, text/plain, */*'
          }
        });
      } catch {
        // ignore warmup failures; cookies may still be populated
      }
    }, warmupUrl);

    await page.waitForTimeout(1500);

    const browserUserAgent = await page.evaluate(() => navigator.userAgent);
    const cookies = await context.cookies();
    const pedidosYaCookies = cookies.filter((cookie) => cookie.domain.includes('pedidosya.com.uy'));
    const cookieHeader = pedidosYaCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');

    if (!cookieHeader) {
      throw new Error('PEDIDOSYA_AUTO_REFRESH_EMPTY_COOKIE');
    }

    state.cookieHeader = cookieHeader;
    state.source = 'auto';
    state.updatedAt = new Date().toISOString();
    state.lastAutoRefreshError = null;
    state.userAgent = browserUserAgent || state.userAgent;

    return getPedidosYaSession();
  } catch (error) {
    state.lastAutoRefreshError = error instanceof Error ? error.message : 'UNKNOWN_AUTO_REFRESH_ERROR';
    throw error;
  } finally {
    await browser.close();
  }
}

function parseCookieHeader(cookieText: string): string {
  const trimmed = cookieText.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes(';') && !trimmed.includes('\n')) {
    return trimmed.replace(/^cookie:\s*/i, '').trim();
  }

  const pairs: string[] = [];

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.includes('\t')) {
      const [name, value] = line.split('\t');
      if (name && value) {
        pairs.push(`${name.trim()}=${value.trim()}`);
      }
      continue;
    }

    if (line.startsWith('cookie:')) {
      return line.replace(/^cookie:\s*/i, '').trim();
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex > 0) {
      pairs.push(line);
    }
  }

  return pairs.join('; ');
}

function parseSearchTemplate(
  requestText: string
): {
  url: string;
  referer: string;
} | null {
  const trimmed = requestText.trim();
  if (!trimmed) {
    return null;
  }

  const urlCandidate = extractSearchUrl(trimmed);
  if (!urlCandidate) {
    return null;
  }

  const normalizedUrl = normalizeSearchUrl(urlCandidate, trimmed);
  if (!normalizedUrl) {
    return null;
  }

  const referer =
    extractHeaderValue(trimmed, 'referer') ||
    extractCurlHeaderValue(trimmed, 'referer') ||
    DEFAULT_PEDIDOSYA_SEARCH_REFERER;

  return {
    url: normalizedUrl,
    referer: referer.trim()
  };
}

function extractSearchUrl(text: string): string | null {
  const requestUrlMatch = text.match(/Request URL:\s*(https?:\/\/\S+)/i);
  if (requestUrlMatch) {
    return requestUrlMatch[1];
  }

  const curlUrlMatch = text.match(/curl\s+(?:--location\s+)?['"]?(https?:\/\/[^'"\s\\]+)['"]?/i);
  if (curlUrlMatch) {
    return curlUrlMatch[1];
  }

  const absoluteUrlMatch = text.match(/https?:\/\/[^\s'"]+\/groceries\/web\/v1\/catalogues\/[^\s'"]+\/search[^\s'"]*/i);
  if (absoluteUrlMatch) {
    return absoluteUrlMatch[0];
  }

  const rawRequestMatch = text.match(/^GET\s+([^\s]+\/search[^\s]*)\s+HTTP\/\d/im);
  if (rawRequestMatch) {
    return rawRequestMatch[1];
  }

  return null;
}

function normalizeSearchUrl(urlCandidate: string, sourceText: string): string | null {
  try {
    if (urlCandidate.startsWith('http://') || urlCandidate.startsWith('https://')) {
      return new URL(urlCandidate).toString();
    }

    const host =
      extractHeaderValue(sourceText, 'host') ||
      extractCurlHeaderValue(sourceText, 'host') ||
      'www.pedidosya.com.uy';

    return new URL(`https://${host}${urlCandidate}`).toString();
  } catch {
    return null;
  }
}

function extractHeaderValue(text: string, headerName: string): string | null {
  const headerMatch = text.match(new RegExp(`^${headerName}:\\s*(.+)$`, 'im'));
  return headerMatch?.[1]?.trim() ?? null;
}

function extractCurlHeaderValue(text: string, headerName: string): string | null {
  const headerRegex = new RegExp(
    `-H\\s+['"]${headerName}:\\s*([^'"]+)['"]`,
    'i'
  );
  const match = text.match(headerRegex);
  return match?.[1]?.trim() ?? null;
}
