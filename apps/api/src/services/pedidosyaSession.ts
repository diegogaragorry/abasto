import { chromium } from 'playwright';

const PEDIDOSYA_HOME_URL = 'https://www.pedidosya.com.uy/';
const PEDIDOSYA_WARMUP_URL =
  'https://www.pedidosya.com.uy/groceries/web/v1/catalogues/306090/search?max=5&offset=0&partnerId=286802&query=banana&sort=default';
const AUTO_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

export type PedidosYaSessionSource = 'env' | 'manual' | 'auto' | 'none';

export type PedidosYaSessionState = {
  cookieHeader: string;
  userAgent: string;
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
  source: process.env.PEDIDOSYA_COOKIE?.trim() ? 'env' : 'none',
  updatedAt: process.env.PEDIDOSYA_COOKIE?.trim() ? new Date().toISOString() : null,
  lastAutoRefreshAt: null,
  lastAutoRefreshError: null
};

export function getPedidosYaSession(): PedidosYaSessionState {
  return { ...state };
}

export function updatePedidosYaSession(input: { cookieText: string; userAgent?: string | null }) {
  const cookieHeader = parseCookieHeader(input.cookieText);
  state.cookieHeader = cookieHeader;
  state.source = cookieHeader ? 'manual' : 'none';
  state.updatedAt = cookieHeader ? new Date().toISOString() : null;

  if (input.userAgent && input.userAgent.trim().length > 0) {
    state.userAgent = input.userAgent.trim();
  }

  return getPedidosYaSession();
}

export function clearPedidosYaSession() {
  state.cookieHeader = '';
  state.userAgent = DEFAULT_USER_AGENT;
  state.source = 'none';
  state.updatedAt = null;
  state.lastAutoRefreshError = null;
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
    }, PEDIDOSYA_WARMUP_URL);

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
