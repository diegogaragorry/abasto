import type { BasketCalculationResult } from '@abasto/shared';

interface BasketCalculationPanelProps {
  result: BasketCalculationResult | null;
  isLoading: boolean;
  error: string | null;
  onCalculate: () => Promise<void>;
}

export function BasketCalculationPanel({ result, isLoading, error, onCalculate }: BasketCalculationPanelProps) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Costo mensual</p>
          <h3>Plan de compra por comercio</h3>
        </div>
      </div>

      <button type="button" onClick={() => void onCalculate()} disabled={isLoading}>
        {isLoading ? 'Calculando...' : 'Calcular costo mensual'}
      </button>

      <p className="muted">
        El cálculo toma el último precio por comercio, elige el más conveniente por producto y suma envíos por
        frecuencia cuando ese comercio tiene compras semanales, bisemanales o mensuales.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {!result && !error ? <p className="muted">Corré el cálculo para ver total, envíos y lista de compra agrupada.</p> : null}

      {result ? (
        <div className="stack">
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="muted">Total mensual</span>
              <strong>${result.totalCost.toFixed(2)}</strong>
            </div>
            <div className="metric-card">
              <span className="muted">Envíos mensuales</span>
              <strong>
                $
                {Object.values(result.shippingBreakdown)
                  .reduce((sum, value) => sum + value, 0)
                  .toFixed(2)}
              </strong>
            </div>
          </div>

          {result.itemBreakdown.length > 0 ? (
            <div className="stack">
              <div>
                <p className="eyebrow">Detalle</p>
                <h3>Productos elegidos</h3>
              </div>
              {result.itemBreakdown.map((item) => (
                <div key={`${item.productId}-${item.storeName}`} className="metric-card">
                  <div className="batch-row">
                    <strong>{capitalizeFirstLetter(item.productName)}</strong>
                    <strong>${item.totalCost.toFixed(2)}</strong>
                  </div>
                  <span className="muted">
                    {item.storeName} · {item.monthlyEquivalentQuantity} eq. mensuales x ${item.unitPrice.toFixed(2)} por{' '}
                    {formatUnit(item.unit)}
                  </span>
                  <span className="muted">
                    Semanal {item.weeklyQuantity} · Bisemanal {item.biweeklyQuantity} · Mensual {item.monthlyQuantity}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {result.storePlans.length > 0 ? (
            <div className="store-plan-grid">
              {result.storePlans.map((storePlan) => (
                <article key={storePlan.storeName} className="store-plan-card">
                  <div className="store-card-header">
                    <div>
                      <p className="eyebrow">Comercio</p>
                      <h4>{storePlan.storeName}</h4>
                    </div>
                    <div className="store-plan-summary">
                      <strong>${storePlan.totalCost.toFixed(2)}</strong>
                      <small>
                        Productos ${storePlan.totalProductCost.toFixed(2)} · Envío ${storePlan.monthlyShippingCost.toFixed(2)}
                      </small>
                    </div>
                  </div>

                  <FrequencyList title="Semanal" items={storePlan.weekly} multiplierText="x 4 semanas" />
                  <FrequencyList title="Bisemanal" items={storePlan.biweekly} multiplierText="x 2 semanas" />
                  <FrequencyList title="Mensual" items={storePlan.monthly} multiplierText="x 1 mes" />
                </article>
              ))}
            </div>
          ) : null}

          {Object.keys(result.storeBreakdown).length > 0 ? (
            <div className="stack">
              <div>
                <p className="eyebrow">Totales por comercio</p>
              </div>
              {Object.entries(result.storeBreakdown).map(([storeName, total]) => (
                <div key={storeName} className="batch-row">
                  <span>{storeName}</span>
                  <strong>${total.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FrequencyList({
  title,
  items,
  multiplierText
}: {
  title: string;
  items: BasketCalculationResult['storePlans'][number]['weekly'];
  multiplierText: string;
}) {
  return (
    <div className="frequency-section">
      <div className="batch-row">
        <strong>{title}</strong>
        <span className="muted">{multiplierText}</span>
      </div>

      {items.length === 0 ? (
        <p className="muted">Sin productos.</p>
      ) : (
        <div className="store-price-list">
          {items.map((item) => (
            <div key={`${title}-${item.productId}`} className="store-price-row">
              <div>
                <strong>{capitalizeFirstLetter(item.productName)}</strong>
                <small>
                  {item.quantity} {formatUnit(item.unit)}
                </small>
              </div>
              <div className="store-price-value">
                <strong>${item.totalCost.toFixed(2)}</strong>
                <small>${item.unitPrice.toFixed(2)} c/u</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatUnit(unit: 'KG' | 'UNIT' | 'LITER') {
  if (unit === 'UNIT') {
    return 'unidad';
  }
  if (unit === 'LITER') {
    return 'litro';
  }
  return 'kg';
}

function capitalizeFirstLetter(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
