export interface UnmatchedItem {
  raw: string;
  normalized: string;
  price: number;
  quantity: number;
  unit: string | null;
}

export interface BatchSummary {
  batchId: number;
  createdAt: string;
  storeName: string;
  importedCount: number;
  unmatched: UnmatchedItem[];
}

export interface StoreRecentPrice {
  productId: number;
  productName: string;
  price: number;
  normalizedPrice: number | null;
  normalizedUnit: 'kg' | 'l' | 'unidad' | null;
  sourceLabel: string | null;
  capturedAt: string;
}

export interface StoreOverview {
  id: number;
  name: string;
  type: StoreType;
  shippingCost: number;
  latestUpdateAt: string | null;
  recentPrices: StoreRecentPrice[];
}

export interface BasketCalculationResult {
  totalCost: number;
  storeBreakdown: Record<string, number>;
  shippingBreakdown: Record<string, number>;
  itemBreakdown: BasketCalculationItem[];
  storePlans: BasketStorePlan[];
}

export interface BasketCalculationItem {
  productId: number;
  productName: string;
  storeName: string;
  weeklyQuantity: number;
  biweeklyQuantity: number;
  monthlyQuantity: number;
  monthlyEquivalentQuantity: number;
  unit: ProductUnit;
  unitPrice: number;
  totalCost: number;
}

export interface BasketStorePlan {
  storeName: string;
  shippingCost: number;
  monthlyShippingCost: number;
  totalProductCost: number;
  totalCost: number;
  weekly: BasketStorePlanItem[];
  biweekly: BasketStorePlanItem[];
  monthly: BasketStorePlanItem[];
}

export interface BasketStorePlanItem {
  productId: number;
  productName: string;
  quantity: number;
  unit: ProductUnit;
  unitPrice: number;
  totalCost: number;
}

export type ProductUnit = 'KG' | 'UNIT' | 'LITER';
export type ProductCategory = 'ALMACEN' | 'VERDURAS' | 'FRUTAS' | 'LACTEOS' | 'CARNES' | 'CONGELADOS' | 'LIMPIEZA' | 'OTROS';
export type StoreType = 'SUPERMARKET' | 'DELIVERY' | 'BUTCHER' | 'FERIA';

export interface ProductLatestPrice {
  storeName: string;
  price: number;
  pricePerKg: number | null;
  pricePerLiter: number | null;
  pricePerUnit: number | null;
  sourceLabel: string | null;
  capturedAt: string;
}

export interface ProductListItem {
  id: number;
  name: string;
  brandName: string | null;
  unit: ProductUnit;
  category: ProductCategory;
  sizeValue: number;
  latestPrices: ProductLatestPrice[];
}

export interface ProductUpdateInput {
  name: string;
  brandName: string | null;
  unit: ProductUnit;
  category: ProductCategory;
}

export interface StoreSyncSummary {
  processed: number;
  matched: number;
  skipped: number;
  failed: number;
  blocked?: boolean;
  message?: string | null;
}

export interface PedidosYaSessionStatus {
  hasCookie: boolean;
  userAgent: string;
}

export interface PedidosYaSessionInput {
  cookieText: string;
  userAgent?: string | null;
}

export interface ProductPriceHistoryEntry {
  id: number;
  storeName: string;
  price: number;
  pricePerKg: number | null;
  pricePerLiter: number | null;
  pricePerUnit: number | null;
  sourceLabel: string | null;
  capturedAt: string;
}

export interface BasketItemInput {
  productId: number;
  weeklyQuantity: number;
  biweeklyQuantity: number;
  monthlyQuantity: number;
}

export interface BasketItemSummary {
  productId: number;
  productName: string;
  category: ProductCategory;
  unit: ProductUnit;
  sizeValue: number;
  weeklyQuantity: number;
  biweeklyQuantity: number;
  monthlyQuantity: number;
}

export interface BasketSummary {
  id: number;
  name: string;
  items: BasketItemSummary[];
}

export interface StoreUpdateInput {
  shippingCost: number;
}
