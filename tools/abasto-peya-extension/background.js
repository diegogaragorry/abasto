const PEYA_MARKET_URL =
  'https://www.pedidosya.com.uy/restaurantes/montevideo/pedidosya-market-13-1c303044-02f5-4ec1-a797-2d9b97737801-menu/buscar';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ABASTO_START_PEYA_SYNC') {
    void runPedidosYaSync(message.payload, sender.tab?.id ?? null);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === 'PEYA_COLLECT_PROGRESS') {
    const abastoTabId = message.payload?.abastoTabId;
    if (typeof abastoTabId === 'number') {
      notifyAbasto(abastoTabId, message.payload.progress);
    }
  }

  return false;
});

async function runPedidosYaSync(setup, abastoTabId) {
  if (typeof abastoTabId !== 'number') {
    return;
  }

  try {
    notifyAbasto(abastoTabId, {
      status: 'running',
      message: 'Preparando sincronizacion con PedidosYa...'
    });

    const requestsResponse = await fetch(setup.requestsUrl, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${setup.token}`
      }
    });

    if (!requestsResponse.ok) {
      throw new Error('No se pudieron obtener las busquedas desde Abasto.');
    }

    const { requests } = await requestsResponse.json();
    const peyaTabId = await ensurePedidosYaTab(setup.marketUrl || PEYA_MARKET_URL);

    notifyAbasto(abastoTabId, {
      status: 'running',
      message: `Leyendo ${requests.length} busquedas desde PedidosYa...`,
      current: 0,
      total: requests.length
    });

    const collectResponse = await sendMessageWithRetry(peyaTabId, {
      type: 'PEYA_COLLECT_PRODUCTS',
      payload: {
        requests,
        abastoTabId
      }
    });

    if (!collectResponse?.ok) {
      throw new Error(collectResponse?.error || 'No se pudo leer PedidosYa desde la extension.');
    }

    notifyAbasto(abastoTabId, {
      status: 'running',
      message: 'Guardando resultados en Abasto...'
    });

    const persistResponse = await fetch(setup.resultsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${setup.token}`
      },
      body: JSON.stringify({
        results: collectResponse.results
      })
    });
    const summary = await persistResponse.json().catch(() => null);

    if (!persistResponse.ok) {
      throw new Error(summary?.error || 'No se pudieron guardar los resultados en Abasto.');
    }

    notifyAbasto(abastoTabId, {
      status: 'completed',
      message: `PedidosYa sincronizado: ${summary.matched}/${summary.processed} productos con precio.`,
      summary
    });
  } catch (error) {
    notifyAbasto(abastoTabId, {
      status: 'failed',
      message: error instanceof Error ? error.message : 'Fallo la sincronizacion de PedidosYa.'
    });
  }
}

async function ensurePedidosYaTab(marketUrl) {
  const tabs = await chrome.tabs.query({
    url: 'https://www.pedidosya.com.uy/*'
  });
  const marketTab = tabs.find((tab) => tab.id && tab.url?.includes('pedidosya-market')) ?? tabs[0];

  if (marketTab?.id) {
    await chrome.tabs.update(marketTab.id, {
      active: true,
      url: marketTab.url || marketUrl
    });
    await waitForTabComplete(marketTab.id);
    return marketTab.id;
  }

  const createdTab = await chrome.tabs.create({
    url: marketUrl,
    active: true
  });

  if (!createdTab.id) {
    throw new Error('No se pudo abrir PedidosYaMarket.');
  }

  await waitForTabComplete(createdTab.id);
  return createdTab.id;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 1200);
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        finish();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        finish();
      }
    });
  });
}

async function sendMessageWithRetry(tabId, message) {
  let lastError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }

  throw lastError ?? new Error('No se pudo conectar con la pestaña de PedidosYa.');
}

function notifyAbasto(tabId, payload) {
  chrome.tabs.sendMessage(tabId, {
    type: 'ABASTO_PEYA_PROGRESS',
    payload
  }).catch(() => {
    // If the Abasto tab was closed, there is nowhere to report progress.
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
