import type { BasketItemInput, BasketSummary, ProductListItem } from '@abasto/shared';
import { useEffect, useState } from 'react';

interface BasketEditorProps {
  basket: BasketSummary | null;
  products: ProductListItem[];
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  isReadOnly: boolean;
  onSave: (items: BasketItemInput[]) => Promise<void>;
}

type QuantityDraft = {
  weeklyQuantity: string;
  biweeklyQuantity: string;
  monthlyQuantity: string;
};

export function BasketEditor({ basket, products, isLoading, error, isSaving, isReadOnly, onSave }: BasketEditorProps) {
  const [quantities, setQuantities] = useState<Record<number, QuantityDraft>>({});
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'SELECTED'>('ALL');
  const [saveState, setSaveState] = useState<string | null>(null);

  useEffect(() => {
    if (!basket) {
      return;
    }

    const nextQuantities: Record<number, QuantityDraft> = {};
    const nextSelectedProductIds: number[] = [];
    for (const item of basket.items) {
      nextQuantities[item.productId] = {
        weeklyQuantity: String(item.weeklyQuantity),
        biweeklyQuantity: String(item.biweeklyQuantity),
        monthlyQuantity: String(item.monthlyQuantity)
      };
      nextSelectedProductIds.push(item.productId);
    }
    setQuantities(nextQuantities);
    setSelectedProductIds(nextSelectedProductIds);
  }, [basket]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState(null);

    const payload = products
      .filter((product) => selectedProductIds.includes(product.id))
      .map((product) => {
        const draft = quantities[product.id] ?? EMPTY_DRAFT;
        return {
          productId: product.id,
          weeklyQuantity: parseQuantity(draft.weeklyQuantity),
          biweeklyQuantity: parseQuantity(draft.biweeklyQuantity),
          monthlyQuantity: parseQuantity(draft.monthlyQuantity)
        };
      })
      .filter(
        (item) =>
          !Number.isNaN(item.weeklyQuantity) &&
          !Number.isNaN(item.biweeklyQuantity) &&
          !Number.isNaN(item.monthlyQuantity)
      );

    try {
      await onSave(payload);
      setSaveState('Basket saved.');
    } catch {
      setSaveState('Failed to save basket.');
    }
  }

  const groupedProducts = groupProductsByCategory(
    products.filter((product) => activeFilter === 'ALL' || selectedProductIds.includes(product.id))
  );

  return (
    <section className="panel basket-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Basket</p>
          <h3>Edit purchase frequencies</h3>
        </div>
      </div>

      <p className="muted">
        Cargá cantidades por compra semanal, bisemanal o mensual. El cálculo mensual usa `semanal x 4`, `bisemanal x
        2` y `mensual x 1`.
      </p>

      {isReadOnly ? <p className="warning">Los campos están bloqueados hasta iniciar sesión.</p> : null}

      <div className="product-filters">
        <button
          type="button"
          className={activeFilter === 'ALL' ? 'secondary-button filter-button filter-button-active' : 'secondary-button filter-button'}
          onClick={() => setActiveFilter('ALL')}
        >
          Todos
        </button>
        <button
          type="button"
          className={activeFilter === 'SELECTED' ? 'secondary-button filter-button filter-button-active' : 'secondary-button filter-button'}
          onClick={() => setActiveFilter('SELECTED')}
        >
          Seleccionados
        </button>
      </div>

      {isLoading ? <p className="muted">Loading basket...</p> : null}
      {!isLoading && error ? <p className="error">{error}</p> : null}
      {!isLoading && !error && products.length === 0 ? <p className="muted">Add products before editing basket.</p> : null}

      {!isLoading && !error && products.length > 0 ? (
          <form className="stack" onSubmit={handleSubmit}>
          <div className="table-shell">
            <table className="data-table basket-table">
              <thead>
                <tr>
                  <th>Mostrar</th>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th>Semanal</th>
                  <th>Bisemanal</th>
                  <th>Mensual</th>
                  <th>Equiv. mensual</th>
                </tr>
              </thead>
              <tbody>
                {groupedProducts.map((group) => (
                  <GroupRows
                    key={group.category}
                    category={group.category}
                    products={group.products}
                    quantities={quantities}
                    selectedProductIds={selectedProductIds}
                    isReadOnly={isReadOnly}
                    onToggleSelected={(productId) =>
                      setSelectedProductIds((current) =>
                        current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
                      )
                    }
                    onChange={(productId, field, value) =>
                      setQuantities((current) => ({
                        ...current,
                        [productId]: {
                          ...(current[productId] ?? EMPTY_DRAFT),
                          [field]: value
                        }
                      }))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          <button type="submit" disabled={isSaving || isReadOnly}>
            {isReadOnly ? 'Read only' : isSaving ? 'Saving...' : 'Save basket'}
          </button>
          {saveState ? <p className={saveState.includes('Failed') ? 'error' : 'success'}>{saveState}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

function GroupRows({
  category,
  products,
  quantities,
  selectedProductIds,
  isReadOnly,
  onToggleSelected,
  onChange
}: {
  category: ProductListItem['category'];
  products: ProductListItem[];
  quantities: Record<number, QuantityDraft>;
  selectedProductIds: number[];
  isReadOnly: boolean;
  onToggleSelected: (productId: number) => void;
  onChange: (productId: number, field: keyof QuantityDraft, value: string) => void;
}) {
  return (
    <>
      <tr className="category-row">
        <td colSpan={7}>{formatCategoryLabel(category)}</td>
      </tr>
      {products.map((product) => {
        const draft = quantities[product.id] ?? EMPTY_DRAFT;
        const isSelected = selectedProductIds.includes(product.id);
        return (
          <tr key={product.id}>
            <td>
              <input
                className="basket-checkbox"
                type="checkbox"
                checked={isSelected}
                disabled={isReadOnly}
                onChange={() => onToggleSelected(product.id)}
              />
            </td>
            <td>
              <strong>{capitalizeFirstLetter(product.name)}</strong>
            </td>
            <td>
              {product.unit}
              {product.sizeValue !== 1 ? ` ${product.sizeValue}` : ''}
            </td>
            <td>
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.weeklyQuantity}
                onChange={(event) => {
                  if (!isSelected) {
                    onToggleSelected(product.id);
                  }
                  onChange(product.id, 'weeklyQuantity', event.target.value);
                }}
                placeholder="0"
                disabled={!isSelected || isReadOnly}
              />
            </td>
            <td>
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.biweeklyQuantity}
                onChange={(event) => {
                  if (!isSelected) {
                    onToggleSelected(product.id);
                  }
                  onChange(product.id, 'biweeklyQuantity', event.target.value);
                }}
                placeholder="0"
                disabled={!isSelected || isReadOnly}
              />
            </td>
            <td>
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.monthlyQuantity}
                onChange={(event) => {
                  if (!isSelected) {
                    onToggleSelected(product.id);
                  }
                  onChange(product.id, 'monthlyQuantity', event.target.value);
                }}
                placeholder="0"
                disabled={!isSelected || isReadOnly}
              />
            </td>
            <td>
              {isSelected
                ? formatQuantity(
                    getMonthlyEquivalentQuantity(
                      parseQuantity(draft.weeklyQuantity),
                      parseQuantity(draft.biweeklyQuantity),
                      parseQuantity(draft.monthlyQuantity)
                    )
                  )
                : '0'}
            </td>
          </tr>
        );
      })}
    </>
  );
}

const EMPTY_DRAFT: QuantityDraft = {
  weeklyQuantity: '0',
  biweeklyQuantity: '0',
  monthlyQuantity: '0'
};

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getMonthlyEquivalentQuantity(weeklyQuantity: number, biweeklyQuantity: number, monthlyQuantity: number): number {
  return weeklyQuantity * 4 + biweeklyQuantity * 2 + monthlyQuantity;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function groupProductsByCategory(products: ProductListItem[]) {
  const groups = new Map<ProductListItem['category'], ProductListItem[]>();
  const categoryOrder: ProductListItem['category'][] = [
    'FRUTAS',
    'VERDURAS',
    'LACTEOS',
    'CARNES',
    'ALMACEN',
    'CONGELADOS',
    'LIMPIEZA',
    'OTROS'
  ];

  for (const product of products) {
    const items = groups.get(product.category) ?? [];
    items.push(product);
    groups.set(product.category, items);
  }

  return categoryOrder
    .filter((category) => groups.has(category))
    .map((category) => ({
      category,
      products: (groups.get(category) ?? []).slice().sort((left, right) => left.name.localeCompare(right.name))
    }));
}

function formatCategoryLabel(category: ProductListItem['category']): string {
  if (category === 'LACTEOS') {
    return 'Lacteos';
  }

  if (category === 'CONGELADOS') {
    return 'Congelados';
  }

  if (category === 'LIMPIEZA') {
    return 'Limpieza';
  }

  return category.charAt(0) + category.slice(1).toLowerCase();
}

function capitalizeFirstLetter(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
