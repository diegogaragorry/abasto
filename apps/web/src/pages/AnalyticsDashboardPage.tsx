import type {
  BasketSummary,
  BasketItemSummary,
  ProductCategory,
  ProductLatestPrice,
  ProductListItem,
  StoreOverview
} from '@abasto/shared';
import { useEffect, useState } from 'react';
import { fetchBasket, fetchProducts, fetchStores } from '../routes/api';

const EPSILON = 0.0001;
const CATEGORY_FILTERS: ProductCategory[] = ['ALMACEN', 'VERDURAS', 'FRUTAS', 'LACTEOS', 'CARNES', 'CONGELADOS', 'LIMPIEZA', 'OTROS'];
type FrequencyKey = 'weekly' | 'biweekly' | 'monthly';
const FREQUENCY_FILTERS: Array<{
  key: FrequencyKey;
  label: string;
  quantityKey: 'weeklyQuantity' | 'biweeklyQuantity' | 'monthlyQuantity';
}> = [
  { key: 'weekly', label: 'Semanal', quantityKey: 'weeklyQuantity' },
  { key: 'biweekly', label: 'Bisemanal', quantityKey: 'biweeklyQuantity' },
  { key: 'monthly', label: 'Mensual', quantityKey: 'monthlyQuantity' }
];

type ComparablePrice = {
  storeName: string;
  value: number;
  unitLabel: 'kg' | 'l' | 'unidad';
  sourceLabel: string | null;
};

type ProductComparison = {
  product: ProductListItem;
  prices: ComparablePrice[];
};

type StoreWinStat = {
  storeName: string;
  eligibleCount: number;
  cheapestCount: number;
  cheapestPct: number;
};

type StoreCoverageStat = {
  storeName: string;
  coverageCount: number;
  totalProducts: number;
  coveragePct: number;
};

type StoreSavingsStat = {
  storeName: string;
  savings: number;
  eligibleCount: number;
};

type StoreWeightedStat = {
  storeName: string;
  score: number;
  coveragePct: number;
  pricePerformancePct: number;
};

type DealHighlight = {
  productName: string;
  storeName: string;
  category: ProductCategory;
  value: number;
  nextValue: number;
  unitLabel: 'kg' | 'l' | 'unidad';
  savingsPercent: number;
  savingsAmount: number;
};

type CategoryLeader = {
  category: ProductCategory;
  storeName: string;
  coverageCount: number;
  totalProducts: number;
  points: number;
  cheapestCount: number;
};

type FrequencyLeader = {
  key: 'weekly' | 'biweekly' | 'monthly';
  label: string;
  storeName: string;
  coverageCount: number;
  totalItems: number;
  tripProductCost: number;
  tripShippingCost: number;
  tripTotalCost: number;
  itemNames: string[];
};

type DashboardSnapshot = {
  winStats: StoreWinStat[];
  coverageStats: StoreCoverageStat[];
  savingsStats: StoreSavingsStat[];
  weightedStats: StoreWeightedStat[];
  topDeals: DealHighlight[];
  categoryLeaders: CategoryLeader[];
  frequencyLeaders: FrequencyLeader[];
};

export function AnalyticsDashboardPage() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [stores, setStores] = useState<StoreOverview[]>([]);
  const [basket, setBasket] = useState<BasketSummary | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<ProductCategory[]>(CATEGORY_FILTERS);
  const [selectedFrequencies, setSelectedFrequencies] = useState<FrequencyKey[]>(FREQUENCY_FILTERS.map((frequency) => frequency.key));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [nextProducts, nextStores, nextBasket] = await Promise.all([fetchProducts(), fetchStores(), fetchBasket()]);

        if (!cancelled) {
          setProducts(nextProducts);
          setStores(nextStores);
          setBasket(nextBasket);
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

  const productIndex = new Map(products.map((product) => [product.id, product]));
  const isAllCategoriesSelected = selectedCategories.length === CATEGORY_FILTERS.length;
  const isAllFrequenciesSelected = selectedFrequencies.length === FREQUENCY_FILTERS.length;
  const filteredProducts = products.filter((product) => {
    const matchesCategory = isAllCategoriesSelected || selectedCategories.includes(product.category);
    if (!matchesCategory) {
      return false;
    }

    if (isAllFrequenciesSelected || !basket) {
      return true;
    }

    const basketItem = basket.items.find((item) => item.productId === product.id);
    if (!basketItem) {
      return false;
    }

    return matchesSelectedFrequencies(basketItem, selectedFrequencies);
  });

  const filteredBasket =
    basket === null
      ? null
      : {
          ...basket,
          items: basket.items.filter((item) => {
            const product = productIndex.get(item.productId);
            if (!product) {
              return false;
            }

            const matchesCategory = isAllCategoriesSelected || selectedCategories.includes(product.category);
            if (!matchesCategory) {
              return false;
            }

            if (isAllFrequenciesSelected) {
              return true;
            }

            return matchesSelectedFrequencies(item, selectedFrequencies);
          })
        };

  const snapshot = buildDashboardSnapshot(
    filteredProducts,
    stores,
    filteredBasket,
    isAllFrequenciesSelected ? FREQUENCY_FILTERS.map((frequency) => frequency.key) : selectedFrequencies
  );

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Comparativa simple de desempeño por comercio</h2>
        </div>
        <p className="muted">
          Se consideran sólo precios comparables por producto. Para categoría y frecuencia se prioriza cobertura y se desempata por desempeño de precio.
        </p>
      </section>

      <section className="panel dashboard-filter-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Filtros</p>
            <h3>Segmentar el análisis</h3>
          </div>
        </div>

        <div className="dashboard-filter-stack">
          <div className="dashboard-filter-group">
            <span className="dashboard-filter-label">Categoría</span>
            <div className="product-filters">
              <button
                className={isAllCategoriesSelected ? 'secondary-button filter-button filter-button-active' : 'secondary-button filter-button'}
                type="button"
                onClick={() => setSelectedCategories((current) => toggleAllSelection(current, CATEGORY_FILTERS))}
              >
                Todas
              </button>
              {CATEGORY_FILTERS.map((category) => (
                <button
                  key={category}
                  className={selectedCategories.includes(category) ? 'secondary-button filter-button filter-button-active' : 'secondary-button filter-button'}
                  type="button"
                  onClick={() => setSelectedCategories((current) => toggleSelection(current, category))}
                >
                  {formatCategory(category)}
                </button>
              ))}
            </div>
          </div>

          <div className="dashboard-filter-group">
            <span className="dashboard-filter-label">Frecuencia de compra</span>
            <div className="product-filters">
              <button
                className={isAllFrequenciesSelected ? 'secondary-button filter-button filter-button-active' : 'secondary-button filter-button'}
                type="button"
                onClick={() => setSelectedFrequencies((current) => toggleAllSelection(current, FREQUENCY_FILTERS.map((frequency) => frequency.key)))}
              >
                Todas
              </button>
              {FREQUENCY_FILTERS.map((frequency) => (
                <button
                  key={frequency.key}
                  className={selectedFrequencies.includes(frequency.key) ? 'secondary-button filter-button filter-button-active' : 'secondary-button filter-button'}
                  type="button"
                  onClick={() => setSelectedFrequencies((current) => toggleSelection(current, frequency.key))}
                >
                  {frequency.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="muted dashboard-filter-summary">
          Productos considerados: {filteredProducts.length}. Ítems de canasta considerados: {filteredBasket?.items.length ?? 0}.
        </p>
      </section>

      <section className="dashboard-chart-grid dashboard-chart-grid-four">
        <article className="panel dashboard-chart-panel dashboard-compact-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Barato primero</p>
              <h3>% de veces que es el más barato</h3>
            </div>
          </div>

          {isLoading ? <p className="muted">Cargando comparativa...</p> : null}
          {!isLoading && error ? <p className="error">{error}</p> : null}
          {!isLoading && !error ? (
            <BarChart
              emptyLabel="Todavía no hay productos con comparación suficiente."
              items={snapshot.winStats.map((stat) => ({
                label: stat.storeName,
                value: stat.cheapestPct,
                helper: `${stat.cheapestCount} de ${stat.eligibleCount} productos comparables`,
                valueLabel: `${stat.cheapestPct.toFixed(1)}%`
              }))}
            />
          ) : null}
        </article>

        <article className="panel dashboard-chart-panel dashboard-compact-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Cobertura</p>
              <h3>% de productos con precio</h3>
            </div>
          </div>

          {!isLoading && !error ? (
            <BarChart
              emptyLabel="No hay productos filtrados para medir cobertura."
              items={snapshot.coverageStats.map((stat) => ({
                label: stat.storeName,
                value: stat.coveragePct,
                helper: `${stat.coverageCount} de ${stat.totalProducts} productos`,
                valueLabel: `${stat.coveragePct.toFixed(1)}%`
              }))}
            />
          ) : null}
        </article>

        <article className="panel dashboard-chart-panel dashboard-compact-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Ahorro</p>
              <h3>Mercados ordenados por ahorro acumulado</h3>
            </div>
          </div>

          {!isLoading && !error ? (
            <PointsChart
              emptyLabel="Todavía no hay ahorro acumulado para mostrar."
              items={snapshot.savingsStats.map((stat) => ({
                label: stat.storeName,
                value: stat.savings,
                helper: `${stat.eligibleCount} productos comparables`
              }))}
            />
          ) : null}
        </article>

        <article className="panel dashboard-chart-panel dashboard-compact-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Score real</p>
              <h3>Precio y disponibilidad ponderados</h3>
            </div>
          </div>

          {!isLoading && !error ? (
            <BarChart
              emptyLabel="No hay base suficiente para calcular el score."
              items={snapshot.weightedStats.map((stat) => ({
                label: stat.storeName,
                value: stat.score,
                helper: `Disp. ${stat.coveragePct.toFixed(0)}% · Precio ${stat.pricePerformancePct.toFixed(0)}%`,
                valueLabel: stat.score.toFixed(1)
              }))}
            />
          ) : null}
        </article>
      </section>

      <section className="panel dashboard-compact-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Top 5</p>
            <h3>Productos más baratos respecto al siguiente en precio</h3>
          </div>
        </div>

        {isLoading ? <p className="muted">Buscando destacados...</p> : null}
        {!isLoading && !error && snapshot.topDeals.length === 0 ? (
          <p className="muted">No hay diferencias suficientes para destacar todavía.</p>
        ) : null}
        {!isLoading && !error && snapshot.topDeals.length > 0 ? (
          <div className="leader-grid leader-grid-dense">
            {snapshot.topDeals.map((deal) => (
              <article key={`${deal.storeName}-${deal.productName}`} className="leader-card leader-card-dense">
                <div className="store-card-header">
                  <div>
                    <p className="eyebrow">{formatCategory(deal.category)}</p>
                    <h4>{capitalizeFirstLetter(deal.productName)}</h4>
                  </div>
                  <span className="deal-pill">{deal.storeName}</span>
                </div>
                <div className="leader-card-meta">
                  <span>
                    ${formatMoney(deal.value)} / {deal.unitLabel}
                  </span>
                  <span>
                    siguiente: ${formatMoney(deal.nextValue)} / {deal.unitLabel}
                  </span>
                </div>
                <p className="deal-savings">
                  {deal.savingsPercent.toFixed(1)}% más barato (${formatMoney(deal.savingsAmount)} de diferencia)
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel dashboard-compact-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Categorías</p>
            <h3>Mejor mercado por categoría</h3>
          </div>
        </div>

        {isLoading ? <p className="muted">Analizando categorías...</p> : null}
        {!isLoading && !error && snapshot.categoryLeaders.length === 0 ? (
          <p className="muted">No hay base suficiente para elegir mercados por categoría.</p>
        ) : null}
        {!isLoading && !error && snapshot.categoryLeaders.length > 0 ? (
          <div className="leader-grid leader-grid-dense">
            {snapshot.categoryLeaders.map((leader) => (
              <article key={leader.category} className="leader-card leader-card-dense">
                <div className="store-card-header">
                  <div>
                    <p className="eyebrow">{formatCategory(leader.category)}</p>
                    <h4>{leader.storeName}</h4>
                  </div>
                  <span className="deal-pill">
                    {leader.coverageCount}/{leader.totalProducts}
                  </span>
                </div>
                <div className="leader-card-meta">
                  <span>Cobertura {formatPercent((leader.coverageCount / leader.totalProducts) * 100)}</span>
                  <span>Puntaje {leader.points >= 0 ? '+' : ''}{formatMoney(leader.points)}</span>
                  <span>{leader.cheapestCount} victorias</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel dashboard-compact-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Frecuencia</p>
            <h3>Mejor mercado por tipo de compra</h3>
          </div>
        </div>

        {isLoading ? <p className="muted">Analizando la canasta...</p> : null}
        {!isLoading && !error && snapshot.frequencyLeaders.length === 0 ? (
          <p className="muted">No hay ítems activos en la canasta para comparar frecuencias.</p>
        ) : null}
        {!isLoading && !error && snapshot.frequencyLeaders.length > 0 ? (
          <div className="leader-grid leader-grid-dense">
            {snapshot.frequencyLeaders.map((leader) => (
              <article key={leader.key} className="leader-card leader-card-dense">
                <div className="store-card-header">
                  <div>
                    <p className="eyebrow">{leader.label}</p>
                    <h4>{leader.storeName}</h4>
                  </div>
                  <span className="deal-pill">
                    {leader.coverageCount}/{leader.totalItems}
                  </span>
                </div>
                <div className="leader-card-meta">
                  <span>Cobertura {formatPercent((leader.coverageCount / leader.totalItems) * 100)}</span>
                  <span>Productos ${formatMoney(leader.tripProductCost)}</span>
                  <span>Envío ${formatMoney(leader.tripShippingCost)}</span>
                  <span>Total ${formatMoney(leader.tripTotalCost)}</span>
                </div>
                <small className="price-source">{leader.itemNames.slice(0, 4).map(capitalizeFirstLetter).join(', ')}</small>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BarChart({
  items,
  emptyLabel
}: {
  items: Array<{
    label: string;
    value: number;
    helper: string;
    valueLabel: string;
  }>;
  emptyLabel: string;
}) {
  const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0);

  if (items.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }

  return (
    <div className="comparison-chart-list">
      {items.map((item) => (
        <div key={item.label} className="comparison-chart-row">
          <div className="comparison-chart-meta">
            <strong>{item.label}</strong>
            <span>{item.helper}</span>
          </div>
          <div className="comparison-chart-track">
            <div
              className="comparison-chart-fill comparison-chart-fill-strong"
              style={{ width: maxValue > 0 ? `${Math.max(8, (item.value / maxValue) * 100)}%` : '0%' }}
            />
          </div>
          <div className="comparison-chart-value">{item.valueLabel}</div>
        </div>
      ))}
    </div>
  );
}

function PointsChart({
  items,
  emptyLabel
}: {
  items: Array<{
    label: string;
    value: number;
    helper: string;
  }>;
  emptyLabel: string;
}) {
  const maxAbsValue = items.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);

  if (items.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }

  return (
    <div className="points-chart-list">
      {items.map((item) => {
        const width = maxAbsValue > 0 ? `${(Math.abs(item.value) / maxAbsValue) * 100}%` : '0%';
        const isPositive = item.value >= 0;

        return (
          <div key={item.label} className="points-chart-row">
            <div className="comparison-chart-meta">
              <strong>{item.label}</strong>
              <span>{item.helper}</span>
            </div>

            <div className="points-chart-track">
              <div className="points-chart-center-line" />
              <div
                className={isPositive ? 'points-chart-fill points-chart-fill-positive' : 'points-chart-fill points-chart-fill-negative'}
                style={
                  isPositive
                    ? { left: '50%', width }
                    : { left: `calc(50% - ${width})`, width }
                }
              />
            </div>

            <div className="comparison-chart-value">
              {item.value >= 0 ? '+' : ''}
              {formatMoney(item.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildDashboardSnapshot(
  products: ProductListItem[],
  stores: StoreOverview[],
  basket: BasketSummary | null,
  visibleFrequencies: FrequencyKey[]
): DashboardSnapshot {
  const storeNames = new Set<string>(stores.map((store) => store.name));
  const comparisons = products
    .map((product) => ({
      product,
      prices: product.latestPrices
        .map((price) => resolveComparablePrice(product, price))
        .filter((price): price is ComparablePrice => price !== null)
    }))
    .filter((entry) => entry.prices.length > 0);

  for (const comparison of comparisons) {
    for (const price of comparison.prices) {
      storeNames.add(price.storeName);
    }
  }

  const competitiveComparisons = comparisons.filter((comparison) => comparison.prices.length >= 2);
  const winStats = buildStoreWinStats(Array.from(storeNames), competitiveComparisons);
  const coverageStats = buildStoreCoverageStats(Array.from(storeNames), products);
  const savingsStats = buildStoreSavingsStats(Array.from(storeNames), competitiveComparisons);
  const weightedStats = buildStoreWeightedStats(Array.from(storeNames), products, competitiveComparisons);
  const topDeals = buildTopDeals(competitiveComparisons);
  const categoryLeaders = buildCategoryLeaders(products, Array.from(storeNames), competitiveComparisons);
  const frequencyLeaders = buildFrequencyLeaders(products, stores, basket, visibleFrequencies);

  return {
    winStats,
    coverageStats,
    savingsStats,
    weightedStats,
    topDeals,
    categoryLeaders,
    frequencyLeaders
  };
}

function buildStoreWinStats(storeNames: string[], comparisons: ProductComparison[]): StoreWinStat[] {
  const stats = new Map(storeNames.map((storeName) => [storeName, { eligibleCount: 0, cheapestCount: 0 }]));

  for (const comparison of comparisons) {
    const cheapest = Math.min(...comparison.prices.map((price) => price.value));

    for (const price of comparison.prices) {
      const current = stats.get(price.storeName);
      if (!current) {
        continue;
      }

      current.eligibleCount += 1;
      if (Math.abs(price.value - cheapest) < EPSILON) {
        current.cheapestCount += 1;
      }
    }
  }

  return Array.from(stats.entries())
    .map(([storeName, stat]) => ({
      storeName,
      eligibleCount: stat.eligibleCount,
      cheapestCount: stat.cheapestCount,
      cheapestPct: stat.eligibleCount > 0 ? (stat.cheapestCount / stat.eligibleCount) * 100 : 0
    }))
    .sort((left, right) => right.cheapestPct - left.cheapestPct || right.cheapestCount - left.cheapestCount || left.storeName.localeCompare(right.storeName));
}

function buildStoreCoverageStats(storeNames: string[], products: ProductListItem[]): StoreCoverageStat[] {
  const totalProducts = products.length;

  return storeNames
    .map((storeName) => {
      const coverageCount = products.reduce((count, product) => {
        const price = product.latestPrices.find((entry) => entry.storeName === storeName);
        return price && resolveComparablePrice(product, price) ? count + 1 : count;
      }, 0);

      return {
        storeName,
        coverageCount,
        totalProducts,
        coveragePct: totalProducts > 0 ? (coverageCount / totalProducts) * 100 : 0
      } satisfies StoreCoverageStat;
    })
    .sort((left, right) => right.coveragePct - left.coveragePct || right.coverageCount - left.coverageCount || left.storeName.localeCompare(right.storeName));
}

function buildStoreSavingsStats(storeNames: string[], comparisons: ProductComparison[]): StoreSavingsStat[] {
  const stats = new Map(storeNames.map((storeName) => [storeName, { savings: 0, eligibleCount: 0 }]));

  for (const comparison of comparisons) {
    const sorted = [...comparison.prices].sort((left, right) => left.value - right.value);
    const cheapest = sorted[0]?.value ?? 0;
    const nextDifferent = sorted.find((price) => price.value - cheapest > EPSILON)?.value ?? null;

    for (const price of comparison.prices) {
      const current = stats.get(price.storeName);
      if (!current) {
        continue;
      }

      current.eligibleCount += 1;
      if (Math.abs(price.value - cheapest) < EPSILON) {
        current.savings += nextDifferent !== null ? nextDifferent - cheapest : 0;
      } else {
        current.savings -= price.value - cheapest;
      }
    }
  }

  return Array.from(stats.entries())
    .map(([storeName, stat]) => ({
      storeName,
      savings: stat.savings,
      eligibleCount: stat.eligibleCount
    }))
    .sort((left, right) => right.savings - left.savings || right.eligibleCount - left.eligibleCount || left.storeName.localeCompare(right.storeName));
}

function buildStoreWeightedStats(
  storeNames: string[],
  products: ProductListItem[],
  comparisons: ProductComparison[]
): StoreWeightedStat[] {
  const comparisonByProduct = new Map(comparisons.map((comparison) => [comparison.product.id, comparison]));
  const totalProducts = products.length;

  return storeNames
    .map((storeName) => {
      let coverageCount = 0;
      let pricePerformanceSum = 0;
      let competitiveCoverageCount = 0;

      for (const product of products) {
        const price = product.latestPrices.find((entry) => entry.storeName === storeName);
        const comparablePrice = price ? resolveComparablePrice(product, price) : null;
        if (!comparablePrice) {
          continue;
        }

        coverageCount += 1;
        const comparison = comparisonByProduct.get(product.id);
        if (!comparison) {
          continue;
        }

        const cheapest = Math.min(...comparison.prices.map((entry) => entry.value));
        pricePerformanceSum += cheapest / comparablePrice.value;
        competitiveCoverageCount += 1;
      }

      const coveragePct = totalProducts > 0 ? (coverageCount / totalProducts) * 100 : 0;
      const pricePerformancePct = competitiveCoverageCount > 0 ? (pricePerformanceSum / competitiveCoverageCount) * 100 : 0;
      const score = coveragePct * 0.45 + pricePerformancePct * 0.55;

      return {
        storeName,
        score,
        coveragePct,
        pricePerformancePct
      } satisfies StoreWeightedStat;
    })
    .sort((left, right) => right.score - left.score || right.coveragePct - left.coveragePct || right.pricePerformancePct - left.pricePerformancePct || left.storeName.localeCompare(right.storeName));
}

function buildTopDeals(comparisons: ProductComparison[]): DealHighlight[] {
  return comparisons
    .flatMap((comparison) => {
      const sorted = [...comparison.prices].sort((left, right) => left.value - right.value);
      const cheapest = sorted[0] ?? null;
      const nextDifferent = sorted.find((price) => cheapest && price.value - cheapest.value > EPSILON) ?? null;
      const cheapestCount = sorted.filter((price) => cheapest && Math.abs(price.value - cheapest.value) < EPSILON).length;

      if (!cheapest || !nextDifferent || cheapestCount !== 1) {
        return [];
      }

      const savingsAmount = nextDifferent.value - cheapest.value;
      const savingsPercent = (savingsAmount / nextDifferent.value) * 100;

      return [
        {
          productName: comparison.product.name,
          storeName: cheapest.storeName,
          category: comparison.product.category,
          value: cheapest.value,
          nextValue: nextDifferent.value,
          unitLabel: cheapest.unitLabel,
          savingsPercent,
          savingsAmount
        } satisfies DealHighlight
      ];
    })
    .sort((left, right) => right.savingsPercent - left.savingsPercent || right.savingsAmount - left.savingsAmount)
    .slice(0, 5);
}

function buildCategoryLeaders(
  products: ProductListItem[],
  storeNames: string[],
  comparisons: ProductComparison[]
): CategoryLeader[] {
  const comparisonsByProduct = new Map(comparisons.map((comparison) => [comparison.product.id, comparison]));
  const categories = Array.from(new Set(products.map((product) => product.category)));

  return categories
    .map((category) => {
      const categoryProducts = products.filter((product) => product.category === category);
      if (categoryProducts.length === 0) {
        return null;
      }

      const rankedStores = storeNames
        .map((storeName) => {
          let coverageCount = 0;
          let points = 0;
          let cheapestCount = 0;

          for (const product of categoryProducts) {
            const price = product.latestPrices.find((entry) => entry.storeName === storeName);
            if (!price || !resolveComparablePrice(product, price)) {
              continue;
            }

            coverageCount += 1;
            const comparison = comparisonsByProduct.get(product.id);
            if (!comparison) {
              continue;
            }

            const sorted = [...comparison.prices].sort((left, right) => left.value - right.value);
            const cheapest = sorted[0]?.value ?? 0;
            const nextDifferent = sorted.find((entry) => entry.value - cheapest > EPSILON)?.value ?? null;
            const current = comparison.prices.find((entry) => entry.storeName === storeName);

            if (!current) {
              continue;
            }

            if (Math.abs(current.value - cheapest) < EPSILON) {
              cheapestCount += 1;
              points += nextDifferent !== null ? nextDifferent - cheapest : 0;
            } else {
              points -= current.value - cheapest;
            }
          }

          return {
            category,
            storeName,
            coverageCount,
            totalProducts: categoryProducts.length,
            points,
            cheapestCount
          } satisfies CategoryLeader;
        })
        .filter((entry) => entry.coverageCount > 0)
        .sort((left, right) => {
          const leftCoverage = left.coverageCount / left.totalProducts;
          const rightCoverage = right.coverageCount / right.totalProducts;
          return rightCoverage - leftCoverage || right.points - left.points || right.cheapestCount - left.cheapestCount || left.storeName.localeCompare(right.storeName);
        });

      return rankedStores[0] ?? null;
    })
    .filter((entry): entry is CategoryLeader => entry !== null);
}

function buildFrequencyLeaders(
  products: ProductListItem[],
  stores: StoreOverview[],
  basket: BasketSummary | null,
  visibleFrequencies: FrequencyKey[]
): FrequencyLeader[] {
  if (!basket) {
    return [];
  }

  const productIndex = new Map(products.map((product) => [product.id, product]));
  const shippingByStore = new Map(stores.map((store) => [store.name, store.shippingCost]));
  return FREQUENCY_FILTERS
    .filter((frequency) => visibleFrequencies.includes(frequency.key))
    .map((frequency) => {
      const items = basket.items.filter((item) => item[frequency.quantityKey] > 0);
      if (items.length === 0) {
        return null;
      }

      const storeNames = Array.from(
        new Set(
          items.flatMap((item) => {
            const product = productIndex.get(item.productId);
            return product?.latestPrices.map((price) => price.storeName) ?? [];
          })
        )
      );

      const rankedStores = storeNames
        .map((storeName) => {
          let coverageCount = 0;
          let tripProductCost = 0;
          const itemNames: string[] = [];

          for (const item of items) {
            const product = productIndex.get(item.productId);
            if (!product) {
              continue;
            }

            const price = product.latestPrices.find((entry) => entry.storeName === storeName);
            const comparablePrice = price ? resolveComparablePrice(product, price) : null;
            if (!comparablePrice) {
              continue;
            }

            coverageCount += 1;
            tripProductCost += item[frequency.quantityKey] * comparablePrice.value;
            itemNames.push(product.name);
          }

          if (coverageCount === 0) {
            return null;
          }

          const tripShippingCost = shippingByStore.get(storeName) ?? 0;

          return {
            key: frequency.key,
            label: frequency.label,
            storeName,
            coverageCount,
            totalItems: items.length,
            tripProductCost,
            tripShippingCost,
            tripTotalCost: tripProductCost + tripShippingCost,
            itemNames
          } satisfies FrequencyLeader;
        })
        .filter((entry): entry is FrequencyLeader => entry !== null)
        .sort((left, right) => {
          const leftCoverage = left.coverageCount / left.totalItems;
          const rightCoverage = right.coverageCount / right.totalItems;
          return rightCoverage - leftCoverage || left.tripTotalCost - right.tripTotalCost || left.storeName.localeCompare(right.storeName);
        });

      return rankedStores[0] ?? null;
    })
    .filter((entry): entry is FrequencyLeader => entry !== null);
}

function resolveComparablePrice(product: ProductListItem, price: ProductLatestPrice): ComparablePrice | null {
  const value =
    product.unit === 'KG'
      ? price.pricePerKg ?? fallbackComparablePrice(price.price, product.sizeValue)
      : product.unit === 'LITER'
        ? price.pricePerLiter ?? fallbackComparablePrice(price.price, product.sizeValue)
        : price.pricePerUnit ?? fallbackComparablePrice(price.price, product.sizeValue);

  if (value === null) {
    return null;
  }

  return {
    storeName: price.storeName,
    value,
    unitLabel: product.unit === 'KG' ? 'kg' : product.unit === 'LITER' ? 'l' : 'unidad',
    sourceLabel: price.sourceLabel
  };
}

function matchesSelectedFrequencies(item: BasketItemSummary, selectedFrequencies: FrequencyKey[]) {
  return selectedFrequencies.some((frequency) => {
    const quantityKey = FREQUENCY_FILTERS.find((entry) => entry.key === frequency)?.quantityKey;
    return quantityKey ? item[quantityKey] > 0 : false;
  });
}

function toggleSelection<T extends string>(current: T[], value: T) {
  if (current.includes(value)) {
    return current.filter((entry) => entry !== value);
  }

  return [...current, value];
}

function toggleAllSelection<T extends string>(current: T[], values: T[]) {
  return current.length === values.length ? [] : values;
}

function fallbackComparablePrice(price: number, sizeValue: number): number | null {
  if (sizeValue <= 0) {
    return price;
  }

  return price / sizeValue;
}

function formatMoney(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`;
}

function capitalizeFirstLetter(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
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
