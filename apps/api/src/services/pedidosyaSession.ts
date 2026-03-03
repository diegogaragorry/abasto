type PedidosYaSessionState = {
  cookieHeader: string;
  userAgent: string;
};

const DEFAULT_USER_AGENT =
  process.env.PEDIDOSYA_USER_AGENT ??
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const state: PedidosYaSessionState = {
  cookieHeader: process.env.PEDIDOSYA_COOKIE?.trim() ?? '',
  userAgent: DEFAULT_USER_AGENT
};

export function getPedidosYaSession(): PedidosYaSessionState {
  return { ...state };
}

export function updatePedidosYaSession(input: { cookieText: string; userAgent?: string | null }) {
  const cookieHeader = parseCookieHeader(input.cookieText);
  state.cookieHeader = cookieHeader;

  if (input.userAgent && input.userAgent.trim().length > 0) {
    state.userAgent = input.userAgent.trim();
  }

  return getPedidosYaSession();
}

export function clearPedidosYaSession() {
  state.cookieHeader = '';
  state.userAgent = DEFAULT_USER_AGENT;
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
