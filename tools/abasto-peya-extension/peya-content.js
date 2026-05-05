chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'PEYA_COLLECT_PRODUCTS') {
    return false;
  }

  void collectProducts(message.payload)
    .then((results) => {
      sendResponse({ ok: true, results });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'No se pudo leer PedidosYa.'
      });
    });

  return true;
});

async function collectProducts({ requests, abastoTabId }) {
  const results = [];

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];

    chrome.runtime.sendMessage({
      type: 'PEYA_COLLECT_PROGRESS',
      payload: {
        abastoTabId,
        progress: {
          status: 'running',
          message: `PedidosYa ${index + 1}/${requests.length}: ${request.query}`,
          current: index + 1,
          total: requests.length
        }
      }
    });

    try {
      const response = await fetch(request.url, {
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*'
        }
      });

      if (!response.ok) {
        results.push({
          query: request.query,
          candidates: []
        });
        continue;
      }

      const json = await response.json();
      if (json.appId || json.blockScript || json.jsClientSrc) {
        throw new Error('PedidosYa devolvio bloqueo anti-bot.');
      }

      results.push({
        query: request.query,
        candidates: Array.isArray(json.data) ? json.data.map(toAbastoCandidate) : []
      });
    } catch (error) {
      console.warn('[Abasto PeYa]', request.query, error);
      results.push({
        query: request.query,
        candidates: []
      });
    }

    await sleep(300);
  }

  return results;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function toAbastoCandidate(product) {
  return {
    name: product?.name,
    price: product?.price,
    price_per_measurement_unit: product?.price_per_measurement_unit,
    content_quantity: product?.content_quantity,
    measurement_unit: product?.measurement_unit
      ? {
          short_name: product.measurement_unit.short_name
        }
      : null
  };
}
