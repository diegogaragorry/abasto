import type {
  BatchSummary,
  BasketCalculationResult,
  BasketItemInput,
  BasketSummary,
  ProductListItem,
  PedidosYaSessionInput,
  PedidosYaSessionStatus,
  StoreOverview,
  StoreUpdateInput,
  StoreSyncSummary,
  ProductUpdateInput,
  ProductPriceHistoryEntry
} from '@abasto/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include'
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function login(password: string): Promise<void> {
  await request('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });
}

export async function fetchBatchHistory(): Promise<BatchSummary[]> {
  return request<BatchSummary[]>('/admin/batches');
}

export async function uploadFeriaPdf(file: File): Promise<BatchSummary> {
  const formData = new FormData();
  formData.append('file', file);

  return request<BatchSummary>('/admin/feria/upload', {
    method: 'POST',
    body: formData
  });
}

export async function syncTataPrices(): Promise<StoreSyncSummary> {
  return request<StoreSyncSummary>('/admin/tata/sync', {
    method: 'POST'
  });
}

export async function syncDiscoPrices(): Promise<StoreSyncSummary> {
  return request<StoreSyncSummary>('/admin/disco/sync', {
    method: 'POST'
  });
}

export async function syncPedidosYaPrices(): Promise<StoreSyncSummary> {
  return request<StoreSyncSummary>('/admin/pedidosya/sync', {
    method: 'POST'
  });
}

export async function fetchPedidosYaSession(): Promise<PedidosYaSessionStatus> {
  return request<PedidosYaSessionStatus>('/admin/pedidosya/session');
}

export async function updatePedidosYaSession(input: PedidosYaSessionInput): Promise<PedidosYaSessionStatus> {
  return request<PedidosYaSessionStatus>('/admin/pedidosya/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });
}

export async function fetchProducts(): Promise<ProductListItem[]> {
  return request<ProductListItem[]>('/api/products');
}

export async function fetchStores(): Promise<StoreOverview[]> {
  return request<StoreOverview[]>('/api/stores');
}

export async function updateStore(storeId: number, input: StoreUpdateInput): Promise<StoreOverview> {
  return request<StoreOverview>(`/admin/stores/${storeId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });
}

export async function updateProduct(productId: number, input: ProductUpdateInput): Promise<ProductListItem> {
  return request<ProductListItem>(`/admin/products/${productId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });
}

export async function createProduct(input: ProductUpdateInput): Promise<ProductListItem> {
  return request<ProductListItem>('/admin/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });
}

export async function deleteProduct(productId: number): Promise<void> {
  await request<void>(`/admin/products/${productId}`, {
    method: 'DELETE'
  });
}

export async function fetchProductPrices(productId: number): Promise<ProductPriceHistoryEntry[]> {
  return request<ProductPriceHistoryEntry[]>(`/api/products/${productId}/prices`);
}

export async function fetchBasket(): Promise<BasketSummary> {
  return request<BasketSummary>('/api/basket');
}

export async function saveBasket(items: BasketItemInput[]): Promise<BasketSummary> {
  return request<BasketSummary>('/api/basket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(items)
  });
}

export async function calculateBasket(): Promise<BasketCalculationResult> {
  return request<BasketCalculationResult>('/api/basket/calculate');
}
