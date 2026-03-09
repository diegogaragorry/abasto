import type {
  BasketCalculationResult,
  BasketItemSummary,
  BasketSummary,
  ProductCategory,
  ProductLatestPrice,
  ProductListItem,
  ProductUnit,
  StoreOverview
} from '@abasto/shared';
import { useEffect, useState } from 'react';
import { calculateBasket, fetchBasket, fetchProducts, fetchStores } from '../routes/api';

type ComparablePrice = {
  storeName: string;
  value: number;
  unitLabel: 'kg' | 'l' | 'unidad';
  sourceLabel: string | null;
  capturedAt: string;
};

type StoreBenchmark = {
  storeName: string;
  storeType: StoreOverview['type'] | null;
  latestUpdateAt: string | null;
  coverageCount: number;
  coveragePct: number;
  cheapestWins: number;
  avgPriceIndex: number | null;
  standoutDeals: number;
  basketCoverageCount: number;
  basketCoveragePct: number;
  basketTotalCost: number | null;
  basketProductCost: number;
  monthlyShippingCost: number;
};

type StandoutDeal = {
  productId: number;
  productName: string;
  category: ProductCategory;
  storeName: string;
  value: number;
  unitLabel: 'kg' | 'l' | 'unidad';
  sourceLabel: string | null;
  nextBestValue: number;
  savingsPercent: number;
  savingsAmount: number;
};

type DashboardAnalytics = {
  totalProducts: number;
  comparableProducts: number;
  totalStores: number;
  basketItemCount: number;
  storeBenchmarks: StoreBenchmark[];
  standoutDeals: StandoutDeal[];
  optimizedBasketTotal: number | null;
  optimizedStoreCount: number;
};

export function AnalyticsDashboardPage() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [stores, setStores] = useState<StoreOverview[]>([]);
  const [basket, setBasket] = useState<BasketSummary | null>(null);
  const [basketCalculation, setBasketCalculation] = useState<BasketCalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [nextProducts, nextStores, nextBasket, nextCalculation] = await Promise.all([
          fetchProducts(),
          fetchStores(),
          fetchBasket(),
          calculateBasket()
        ]);

        if (!cancelled) {
          setProducts(nextProducts);
          setStores(nextStores);
          setBasket(nextBasket);
          setBasketCalculation(nextCalculation);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el dashboard.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const analytics = buildDashboardAnalytics(products, stores, basket, basketCalculation);
  const topDeal = analytics.standoutDeals[0] ?? null;

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Rendimiento comparado de cada comercio</h2>
        </div>
        <p className="muted">
          Leé cobertura, competitividad de precios y oportunidades reales de ahorro a partir del catálogo relevado.
        </p>
      </section>

      <section className="dashboard-metrics-grid">
        <article className="metric-card dashboard-metric-card">
          <p className="eyebrow">Universo comparado</p>
          <strong>{analytics.comparableProducts}</strong>
          <span className="muted">productos con al menos dos precios comparables sobre {analytics.totalProducts}</span>
        </article>

        <article className="metric-card dashboard-metric-card">
          <p className="eyebrow">Canasta optimizada</p>
          <strong>{analytics.optimizedBasketTotal !== null ? `$${formatMoney(analytics.optimizedBasketTotal)}` : 'Sin cálculo'}</strong>
          <span className="muted">
            {analytics.basketItemCount > 0
              ? `${analytics.basketItemCount} ítems activos en la canasta, repartidos entre ${analytics.optimizedStoreCount} comercios`
              : 'No hay ítems activos en la canasta'}
          </span>
        </article>

        <article className="metric-card dashboard-metric-card">
          <p className="eyebrow">Mejor hallazgo</p>
          <strong>{topDeal ? capitalizeFirstLetter(topDeal.productName) : 'Sin destacados todavía'}</strong>
          <span className="muted">
            {topDeal
              ? `${topDeal.storeName} está ${formatPercent(topDeal.savingsPercent)} por debajo de la siguiente opción`
              : 'Todavía no hay diferencias suficientes para destacar'}
          </span>
        </article>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Comparativa general</p>
            <h3>Cómo rinde cada comercio</h3>
          </div>
        </div>

        {isLoading ? <p className="muted">Cargando análisis...</p> : null}
        {!isLoading && error ? <p className="error">{error}</p> : null}
        {!isLoading && !error && analytics.storeBenchmarks.length === 0 ? (
          <p className="muted">Todavía no hay suficientes precios para comparar comercios.</p>
        ) : null}

        {!isLoading && !error && analytics.storeBenchmarks.length > 0 ? (
          <div className="store-benchmark-grid">
            {analytics.storeBenchmarks.map((benchmark) => (
              <article key={benchmark.storeName} className="store-benchmark-card">
                <div className="store-card-header">
                  <div>
                    <p className="eyebrow">{formatStoreType(benchmark.storeType)}</p>
                    <h4>{benchmark.storeName}</h4>
                  </div>
                  <span className="store-update-pill">
                    {benchmark.latestUpdateAt ? `Actualizado ${formatDateTime(benchmark.latestUpdateAt)}` : 'Sin actualización'}
                  </span>
                </div>

                <div className="benchmark-stat-grid">
                  <div className="benchmark-stat">
                    <span>Cobertura</span>
                    <strong>{formatPercent(benchmark.coveragePct)}</strong>
                  </div>
                  <div className="benchmark-stat">
                    <span>Victorias</span>
                    <strong>{benchmark.cheapestWins}</strong>
                  </div>
                  <div className="benchmark-stat">
                    <span>Índice de precio</span>
                    <strong>{benchmark.avgPriceIndex !== null ? `${benchmark.avgPriceIndex.toFixed(1)}` : 'Sin base'}</strong>
                  </div>
                  <div className="benchmark-stat">
                    <span>Deals destacados</span>
                    <strong>{benchmark.standoutDeals}</strong>
                  </div>
                </div>

                <div className="benchmark-basket">
                  <div>
                    <p className="eyebrow">Canasta mensual en ese comercio</p>
                    <strong>
                      {benchmark.basketTotalCost !== null ? `$${formatMoney(benchmark.basketTotalCost)}` : 'Sin cobertura útil'}
                    </strong>
                  </div>
                  <div className="benchmark-basket-meta">
                    <span>{benchmark.basketCoverageCount} ítems cubiertos</span>
                    <span>{formatPercent(benchmark.basketCoveragePct)} de cobertura</span>
                    <span>
                      Envío mensual{' '}
                      {benchmark.monthlyShippingCost > 0 ? `$${formatMoney(benchmark.monthlyShippingCost)}` : 'no aplica'}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {!isLoading && !error && analytics.storeBenchmarks.length > 0 ? (
        <div className="dashboard-chart-grid">
          <ComparisonChart
            title="Costo de canasta por comercio"
            eyebrow="Costo mensual"
            description="Incluye envío mensual estimado según la frecuencia de compra. Si la cobertura es parcial, se aclara en cada fila."
            items={analytics.storeBenchmarks
              .filter((benchmark) => benchmark.basketTotalCost !== null)
              .sort((left, right) => (left.basketTotalCost ?? Number.POSITIVE_INFINITY) - (right.basketTotalCost ?? Number.POSITIVE_INFINITY))
              .map((benchmark) => ({
                label: benchmark.storeName,
                value: benchmark.basketTotalCost ?? 0,
                helper: `${benchmark.basketCoverageCount} ítems · ${formatPercent(benchmark.basketCoveragePct)} cobertura`,
                emphasis: benchmark.basketCoveragePct >= 0.95 ? 'strong' : 'soft'
              }))}
            formatter={(value) => `$${formatMoney(value)}`}
          />

          <ComparisonChart
            title="Índice promedio de precio"
            eyebrow="Competitividad"
            description="100 representa el precio más barato observado por producto. Cuanto más cerca esté un comercio de 100, mejor compite."
            items={analytics.storeBenchmarks
              .filter((benchmark) => benchmark.avgPriceIndex !== null)
              .sort((left, right) => (left.avgPriceIndex ?? Number.POSITIVE_INFINITY) - (right.avgPriceIndex ?? Number.POSITIVE_INFINITY))
              .map((benchmark) => ({
                label: benchmark.storeName,
                value: benchmark.avgPriceIndex ?? 0,
                helper: `${benchmark.cheapestWins} productos liderados · ${formatPercent(benchmark.coveragePct)} cobertura`,
                emphasis: benchmark.cheapestWins > 0 ? 'strong' : 'soft'
              }))}
            formatter={(value) => value.toFixed(1)}
          />
        </div>
      ) : null}

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Oportunidades</p>
            <h3>Productos marcadamente baratos en un comercio</h3>
          </div>
        </div>

        {isLoading ? <p className="muted">Buscando oportunidades...</p> : null}
        {!isLoading && !error && analytics.standoutDeals.length === 0 ? (
          <p className="muted">No hay diferencias suficientemente marcadas entre comercios para destacar por ahora.</p>
        ) : null}

        {!isLoading && !error && analytics.standoutDeals.length > 0 ? (
          <div className="deal-card-grid">
            {analytics.standoutDeals.slice(0, 12).map((deal) => (
              <article key={`${deal.storeName}-${deal.productId}`} className="deal-card">
                <div className="store-card-header">
                  <div>
                    <p className="eyebrow">{formatCategory(deal.category)}</p>
                    <h4>{capitalizeFirstLetter(deal.productName)}</h4>
                  </div>
                  <span className="deal-pill">{deal.storeName}</span>
                </div>

                <div className="deal-pricing">
                  <div>
                    <span className="muted">Precio detectado</span>
                    <strong>
                      ${formatMoney(deal.value)} / {deal.unitLabel}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">Siguiente mejor</span>
                    <strong>
                      ${formatMoney(deal.nextBestValue)} / {deal.unitLabel}
                    </strong>
                  </div>
                </div>

                <p className="deal-savings">
                  Ahorro estimado de {formatPercent(deal.savingsPercent)} (${formatMoney(deal.savingsAmount)}) frente a la siguiente opción.
                </p>

                {deal.sourceLabel ? <small className="price-source">{deal.sourceLabel}</small> : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ComparisonChart({
  title,
  eyebrow,
  description,
  items,
  formatter
}: {
  title: string;
  eyebrow: string;
  description: string;
  items: Array<{
    label: string;
    value: number;
    helper: string;
    emphasis: 'strong' | 'soft';
  }>;
  formatter: (value: number) => string;
}) {
  const maxValue = items.reduce((currentMax, item) => Math.max(currentMax, item.value), 0);

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>

      <p className="muted chart-description">{description}</p>

      {items.length === 0 ? (
        <p className="muted">No hay base suficiente para graficar todavía.</p>
      ) : (
        <div className="comparison-chart-list">
          {items.map((item) => {
            const width = maxValue > 0 ? `${Math.max(10, (item.value / maxValue) * 100)}%` : '0%';

            return (
              <div key={item.label} className="comparison-chart-row">
                <div className="comparison-chart-meta">
                  <strong>{item.label}</strong>
                  <span>{item.helper}</span>
                </div>
                <div className="comparison-chart-track">
                  <div
                    className={
                      item.emphasis === 'strong'
                        ? 'comparison-chart-fill comparison-chart-fill-strong'
                        : 'comparison-chart-fill comparison-chart-fill-soft'
                    }
                    style={{ width }}
                  />
                </div>
                <div className="comparison-chart-value">{formatter(item.value)}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function buildDashboardAnalytics(
  products: ProductListItem[],
  stores: StoreOverview[],
  basket: BasketSummary | null,
  basketCalculation: BasketCalculationResult | null
): DashboardAnalytics {
  const storeIndex = new Map(
    stores.map((store) => [
      store.name,
      {
        storeType: store.type,
        latestUpdateAt: store.latestUpdateAt,
        shippingCost: store.shippingCost
      }
    ])
  );

  const metricsByStore = new Map<
    string,
    {
      coverageCount: number;
      comparableCount: number;
      cheapestWins: number;
      priceIndexSum: number;
      standoutDeals: number;
    }
  >();
  const standoutDeals: StandoutDeal[] = [];
  let comparableProducts = 0;

  for (const product of products) {
    const comparablePrices = product.latestPrices
      .map((price) => {
        const normalized = resolveComparablePrice(product, price);
        return normalized ? normalized : null;
      })
      .filter((price): price is ComparablePrice => price !== null);

    if (comparablePrices.length === 0) {
      continue;
    }

    if (comparablePrices.length >= 2) {
      comparableProducts += 1;
    }

    const cheapestValue = Math.min(...comparablePrices.map((price) => price.value));
    const sortedByPrice = [...comparablePrices].sort((left, right) => left.value - right.value);
    const bestDeal = sortedByPrice[0];
    const nextBest = sortedByPrice[1] ?? null;

    for (const price of comparablePrices) {
      const metrics =
        metricsByStore.get(price.storeName) ??
        {
          coverageCount: 0,
          comparableCount: 0,
          cheapestWins: 0,
          priceIndexSum: 0,
          standoutDeals: 0
        };

      metrics.coverageCount += 1;

      if (comparablePrices.length >= 2) {
        metrics.comparableCount += 1;
        metrics.priceIndexSum += (price.value / cheapestValue) * 100;
      }

      if (Math.abs(price.value - cheapestValue) < 0.0001) {
        metrics.cheapestWins += 1;
      }

      metricsByStore.set(price.storeName, metrics);
    }

    if (nextBest) {
      const savingsPercent = ((nextBest.value - bestDeal.value) / nextBest.value) * 100;
      const savingsAmount = nextBest.value - bestDeal.value;

      if (savingsPercent >= 12) {
        standoutDeals.push({
          productId: product.id,
          productName: product.name,
          category: product.category,
          storeName: bestDeal.storeName,
          value: bestDeal.value,
          unitLabel: bestDeal.unitLabel,
          sourceLabel: bestDeal.sourceLabel,
          nextBestValue: nextBest.value,
          savingsPercent,
          savingsAmount
        });

        const metrics = metricsByStore.get(bestDeal.storeName);
        if (metrics) {
          metrics.standoutDeals += 1;
        }
      }
    }
  }

  const activeBasketItems = (basket?.items ?? []).filter((item) => getMonthlyEquivalentQuantity(item) > 0);
  const storeBenchmarks = Array.from(
    new Set([...storeIndex.keys(), ...products.flatMap((product) => product.latestPrices.map((price) => price.storeName))])
  )
    .map((storeName) => {
      const storeMeta = storeIndex.get(storeName);
      const metrics =
        metricsByStore.get(storeName) ??
        {
          coverageCount: 0,
          comparableCount: 0,
          cheapestWins: 0,
          priceIndexSum: 0,
          standoutDeals: 0
        };

      const basketEstimate = buildBasketEstimateForStore(storeName, activeBasketItems, products, storeMeta?.shippingCost ?? 0);

      return {
        storeName,
        storeType: storeMeta?.storeType ?? null,
        latestUpdateAt: storeMeta?.latestUpdateAt ?? null,
        coverageCount: metrics.coverageCount,
        coveragePct: products.length > 0 ? metrics.coverageCount / products.length : 0,
        cheapestWins: metrics.cheapestWins,
        avgPriceIndex: metrics.comparableCount > 0 ? metrics.priceIndexSum / metrics.comparableCount : null,
        standoutDeals: metrics.standoutDeals,
        basketCoverageCount: basketEstimate.coverageCount,
        basketCoveragePct: activeBasketItems.length > 0 ? basketEstimate.coverageCount / activeBasketItems.length : 0,
        basketTotalCost: basketEstimate.totalCost,
        basketProductCost: basketEstimate.productCost,
        monthlyShippingCost: basketEstimate.monthlyShippingCost
      } satisfies StoreBenchmark;
    })
    .sort((left, right) => {
      if (left.avgPriceIndex === null && right.avgPriceIndex === null) {
        return left.storeName.localeCompare(right.storeName);
      }
      if (left.avgPriceIndex === null) {
        return 1;
      }
      if (right.avgPriceIndex === null) {
        return -1;
      }
      return left.avgPriceIndex - right.avgPriceIndex;
    });

  standoutDeals.sort((left, right) => right.savingsPercent - left.savingsPercent || left.productName.localeCompare(right.productName));

  return {
    totalProducts: products.length,
    comparableProducts,
    totalStores: storeBenchmarks.length,
    basketItemCount: activeBasketItems.length,
    storeBenchmarks,
    standoutDeals,
    optimizedBasketTotal: basketCalculation?.totalCost ?? null,
    optimizedStoreCount: basketCalculation?.storePlans.length ?? 0
  };
}

function buildBasketEstimateForStore(
  storeName: string,
  basketItems: BasketItemSummary[],
  products: ProductListItem[],
  shippingCost: number
) {
  let coverageCount = 0;
  let productCost = 0;
  let monthlyShippingCost = 0;
  let hasWeekly = false;
  let hasBiweekly = false;
  let hasMonthly = false;

  for (const item of basketItems) {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) {
      continue;
    }

    const price = product.latestPrices.find((entry) => entry.storeName === storeName);
    const comparablePrice = price ? resolveComparablePrice(product, price) : null;
    if (!comparablePrice) {
      continue;
    }

    coverageCount += 1;
    productCost += comparablePrice.value * getMonthlyEquivalentQuantity(item);
    hasWeekly = hasWeekly || item.weeklyQuantity > 0;
    hasBiweekly = hasBiweekly || item.biweeklyQuantity > 0;
    hasMonthly = hasMonthly || item.monthlyQuantity > 0;
  }

  if (coverageCount > 0) {
    monthlyShippingCost += hasWeekly ? shippingCost * 4 : 0;
    monthlyShippingCost += hasBiweekly ? shippingCost * 2 : 0;
    monthlyShippingCost += hasMonthly ? shippingCost : 0;
  }

  return {
    coverageCount,
    productCost,
    monthlyShippingCost,
    totalCost: coverageCount > 0 ? productCost + monthlyShippingCost : null
  };
}

function resolveComparablePrice(product: ProductListItem, price: ProductLatestPrice): ComparablePrice | null {
  if (product.unit === 'KG') {
    const value = price.pricePerKg ?? fallbackComparablePrice(price.price, product.sizeValue);
    return value !== null
      ? {
          storeName: price.storeName,
          value,
          unitLabel: 'kg',
          sourceLabel: price.sourceLabel,
          capturedAt: price.capturedAt
        }
      : null;
  }

  if (product.unit === 'LITER') {
    const value = price.pricePerLiter ?? fallbackComparablePrice(price.price, product.sizeValue);
    return value !== null
      ? {
          storeName: price.storeName,
          value,
          unitLabel: 'l',
          sourceLabel: price.sourceLabel,
          capturedAt: price.capturedAt
        }
      : null;
  }

  const value = price.pricePerUnit ?? fallbackComparablePrice(price.price, product.sizeValue);
  return value !== null
    ? {
        storeName: price.storeName,
        value,
        unitLabel: 'unidad',
        sourceLabel: price.sourceLabel,
        capturedAt: price.capturedAt
      }
    : null;
}

function fallbackComparablePrice(price: number, sizeValue: number): number | null {
  if (sizeValue <= 0) {
    return price;
  }

  return price / sizeValue;
}

function getMonthlyEquivalentQuantity(item: Pick<BasketItemSummary, 'weeklyQuantity' | 'biweeklyQuantity' | 'monthlyQuantity'>) {
  return item.weeklyQuantity * 4 + item.biweeklyQuantity * 2 + item.monthlyQuantity;
}

function formatMoney(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function capitalizeFirstLetter(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatStoreType(type: StoreOverview['type'] | null) {
  switch (type) {
    case 'SUPERMARKET':
      return 'Supermercado';
    case 'DELIVERY':
      return 'Delivery';
    case 'BUTCHER':
      return 'Carnicería';
    case 'FERIA':
      return 'Feria';
    default:
      return 'Comercio';
  }
}

function formatCategory(category: ProductCategory) {
  switch (category) {
    case 'ALMACEN':
      return 'Almacén';
    case 'VERDURAS':
      return 'Verduras';
    case 'FRUTAS':
      return 'Frutas';
    case 'LACTEOS':
      return 'Lácteos';
    case 'CARNES':
      return 'Carnes';
    case 'CONGELADOS':
      return 'Congelados';
    case 'LIMPIEZA':
      return 'Limpieza';
    default:
      return 'Otros';
  }
}
