import type { ProductListItem, ProductUpdateInput } from '@abasto/shared';
import { Fragment, useState } from 'react';

interface ProductsTableProps {
  products: ProductListItem[];
  isLoading: boolean;
  error: string | null;
  isAdminAuthenticated: boolean;
  onProductCreated: (input: ProductUpdateInput) => Promise<void>;
  onProductUpdated: (productId: number, input: ProductUpdateInput) => Promise<void>;
  onProductDeleted: (productId: number) => Promise<void>;
}

export function ProductsTable({
  products,
  isLoading,
  error,
  isAdminAuthenticated,
  onProductCreated,
  onProductUpdated,
  onProductDeleted
}: ProductsTableProps) {
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftBrandName, setDraftBrandName] = useState('');
  const [draftUnit, setDraftUnit] = useState<ProductListItem['unit']>('KG');
  const [draftCategory, setDraftCategory] = useState<ProductListItem['category']>('OTROS');
  const [newProductName, setNewProductName] = useState('');
  const [newProductBrandName, setNewProductBrandName] = useState('');
  const [newProductUnit, setNewProductUnit] = useState<ProductListItem['unit']>('KG');
  const [newProductCategory, setNewProductCategory] = useState<ProductListItem['category']>('OTROS');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'ALL' | ProductListItem['category']>('ALL');

  function startEditing(product: ProductListItem) {
    setEditingProductId(product.id);
    setDraftName(product.name);
    setDraftBrandName(product.brandName ?? '');
    setDraftUnit(product.unit);
    setDraftCategory(product.category);
    setSaveError(null);
  }

  function cancelEditing() {
    setEditingProductId(null);
    setDraftName('');
    setDraftBrandName('');
    setDraftUnit('KG');
    setDraftCategory('OTROS');
    setSaveError(null);
  }

  async function saveProduct(productId: number) {
    setIsSaving(true);
    setSaveError(null);

    try {
      await onProductUpdated(productId, {
        name: draftName,
        brandName: draftBrandName.trim().length > 0 ? draftBrandName : null,
        unit: draftUnit,
        category: draftCategory
      });
      cancelEditing();
    } catch (updateError) {
      setSaveError(updateError instanceof Error ? updateError.message : 'No se pudo actualizar el producto.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeProduct(productId: number) {
    const confirmed = window.confirm('¿Eliminar este producto y todos sus precios relacionados?');
    if (!confirmed) {
      return;
    }

    setDeletingProductId(productId);
    setSaveError(null);

    try {
      await onProductDeleted(productId);
      if (editingProductId === productId) {
        cancelEditing();
      }
    } catch (deleteError) {
      setSaveError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el producto.');
    } finally {
      setDeletingProductId(null);
    }
  }

  async function addProduct() {
    setIsCreating(true);
    setSaveError(null);

    try {
      await onProductCreated({
        name: newProductName,
        brandName: newProductBrandName.trim().length > 0 ? newProductBrandName : null,
        unit: newProductUnit,
        category: newProductCategory
      });
      setNewProductName('');
      setNewProductBrandName('');
      setNewProductUnit('KG');
      setNewProductCategory('OTROS');
    } catch (createError) {
      if (createError instanceof Error && createError.message.includes('PRODUCT_ALREADY_EXISTS')) {
        setSaveError('El producto ya existe.');
      } else {
        setSaveError(createError instanceof Error ? createError.message : 'No se pudo crear el producto.');
      }
    } finally {
      setIsCreating(false);
    }
  }

  const groupedProducts = groupProductsByCategory(products, activeCategoryFilter);
  const storeLatestUpdates = getStoreLatestUpdates(products);

  return (
    <section className="panel products-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Productos</p>
          <h3>Últimos precios por comercio</h3>
        </div>
      </div>

      {!isAdminAuthenticated ? <p className="warning">Iniciá sesión para agregar productos nuevos.</p> : null}

      <div className="product-create-row">
        <input
          placeholder="Nombre del producto"
          value={newProductName}
          onChange={(event) => setNewProductName(event.target.value)}
          disabled={!isAdminAuthenticated}
        />
        <input
          placeholder="Marca (opcional)"
          value={newProductBrandName}
          onChange={(event) => setNewProductBrandName(event.target.value)}
          disabled={!isAdminAuthenticated}
        />
        <select
          value={newProductUnit}
          onChange={(event) => setNewProductUnit(event.target.value as ProductListItem['unit'])}
          disabled={!isAdminAuthenticated}
        >
          <option value="KG">KG</option>
          <option value="UNIT">Unidad</option>
          <option value="LITER">Litro</option>
        </select>
        <select
          value={newProductCategory}
          onChange={(event) => setNewProductCategory(event.target.value as ProductListItem['category'])}
          disabled={!isAdminAuthenticated}
        >
          {PRODUCT_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void addProduct()}
          disabled={isCreating || newProductName.trim().length === 0 || !isAdminAuthenticated}
        >
          {isCreating ? 'Agregando...' : 'Agregar producto'}
        </button>
      </div>

      <div className="product-filters">
        {PRODUCT_FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={activeCategoryFilter === option.value ? 'secondary-button filter-button filter-button-active' : 'secondary-button filter-button'}
            onClick={() => setActiveCategoryFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {storeLatestUpdates.length > 0 ? (
        <div className="store-updates">
          {storeLatestUpdates.map((store) => (
            <span key={store.storeName} className="store-update-badge">
              <strong>{store.storeName}</strong>
              <small>{formatCapturedAt(store.capturedAt)}</small>
            </span>
          ))}
        </div>
      ) : null}

      {isLoading ? <p className="muted">Cargando productos...</p> : null}
      {!isLoading && error ? <p className="error">{error}</p> : null}
      {!isLoading && !error && saveError ? <p className="error">{saveError}</p> : null}
      {!isLoading && !error && products.length === 0 ? <p className="muted">Todavía no hay productos cargados.</p> : null}

      {!isLoading && !error && products.length > 0 ? (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca</th>
                <th>Unidad</th>
                <th>Categoría</th>
                <th>Últimos precios</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groupedProducts.map((group) => (
                <Fragment key={`category-${group.category}`}>
                  <tr className="category-row">
                    <td colSpan={6}>{group.category}</td>
                  </tr>
                  {group.products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        {editingProductId === product.id ? (
                          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                        ) : (
                          capitalizeFirstLetter(product.name)
                        )}
                      </td>
                      <td>
                        {editingProductId === product.id ? (
                          <input value={draftBrandName} onChange={(event) => setDraftBrandName(event.target.value)} />
                        ) : (
                          product.brandName ?? ''
                        )}
                      </td>
                      <td>
                        {editingProductId === product.id ? (
                          <select value={draftUnit} onChange={(event) => setDraftUnit(event.target.value as ProductListItem['unit'])}>
                            <option value="KG">KG</option>
                            <option value="UNIT">Unidad</option>
                            <option value="LITER">Litro</option>
                          </select>
                        ) : (
                          <>
                            {formatUnitLabel(product.unit)}
                            {product.sizeValue !== 1 ? ` ${product.sizeValue}` : ''}
                          </>
                        )}
                      </td>
                      <td>
                        {editingProductId === product.id ? (
                          <select
                            value={draftCategory}
                            onChange={(event) => setDraftCategory(event.target.value as ProductListItem['category'])}
                          >
                            {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          formatCategoryLabel(product.category)
                        )}
                      </td>
                      <td>
                        {product.latestPrices.length === 0 ? (
                          <span className="muted">Sin precios todavía</span>
                        ) : (
                          <div className="price-badges">
                            {product.latestPrices.map((price) => (
                              <span key={`${product.id}-${price.storeName}`} className="price-badge">
                                <strong>{formatLatestPrice(product, price)}</strong>
                                {price.sourceLabel ? (
                                  <small className="price-source">
                                    {price.sourceLabel}
                                    {price.sourceLabel.includes(' pesos') ? '' : ` - ${formatMoney(price.price)} pesos`}
                                  </small>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {editingProductId === product.id ? (
                            <>
                              <button type="button" onClick={() => void saveProduct(product.id)} disabled={isSaving}>
                                {isSaving ? 'Guardando...' : 'Guardar'}
                              </button>
                              <button type="button" className="secondary-button" onClick={cancelEditing} disabled={isSaving}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="secondary-button" onClick={() => startEditing(product)}>
                                Editar
                              </button>
                              <button
                                type="button"
                                className="secondary-button danger-button"
                                onClick={() => void removeProduct(product.id)}
                                disabled={deletingProductId === product.id}
                              >
                                {deletingProductId === product.id ? 'Eliminando...' : 'Eliminar'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function formatLatestPrice(product: ProductListItem, price: ProductListItem['latestPrices'][number]): string {
  if (product.unit === 'UNIT' && price.pricePerUnit !== null) {
    return `${price.storeName}: $${formatMoney(price.pricePerUnit)} / unidad`;
  }

  if (price.pricePerKg !== null) {
    return `${price.storeName}: $${formatMoney(price.pricePerKg)} / kg`;
  }

  if (price.pricePerLiter !== null) {
    return `${price.storeName}: $${formatMoney(price.pricePerLiter)} / l`;
  }

  return `${price.storeName}: $${formatMoney(price.price)}`;
}

function formatMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function groupProductsByCategory(
  products: ProductListItem[],
  activeCategoryFilter: 'ALL' | ProductListItem['category']
) {
  const groups = new Map<string, ProductListItem[]>();
  const categoryOrder: ProductListItem['category'][] = [
    'ALMACEN',
    'VERDURAS',
    'FRUTAS',
    'LACTEOS',
    'CARNES',
    'CONGELADOS',
    'LIMPIEZA',
    'OTROS'
  ];

  for (const product of products.filter((item) => activeCategoryFilter === 'ALL' || item.category === activeCategoryFilter)) {
    const category = product.category;
    const items = groups.get(category) ?? [];
    items.push(product);
    groups.set(category, items);
  }

  return categoryOrder
    .filter((category) => groups.has(category))
    .map((category) => ({
      category: formatCategoryLabel(category),
      products: (groups.get(category) ?? []).slice().sort((left, right) => left.name.localeCompare(right.name))
    }));
}

function formatCategoryLabel(category: string): string {
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

function formatUnitLabel(unit: ProductListItem['unit']): string {
  if (unit === 'UNIT') {
    return 'Unidad';
  }

  if (unit === 'LITER') {
    return 'Litro';
  }

  return 'KG';
}

function capitalizeFirstLetter(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getStoreLatestUpdates(products: ProductListItem[]) {
  const latestByStore = new Map<string, string>();

  for (const product of products) {
    for (const price of product.latestPrices) {
      const currentLatest = latestByStore.get(price.storeName);
      if (!currentLatest || new Date(price.capturedAt) > new Date(currentLatest)) {
        latestByStore.set(price.storeName, price.capturedAt);
      }
    }
  }

  return Array.from(latestByStore.entries())
    .map(([storeName, capturedAt]) => ({ storeName, capturedAt }))
    .sort((left, right) => left.storeName.localeCompare(right.storeName));
}

function formatCapturedAt(value: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

const PRODUCT_CATEGORY_OPTIONS: Array<{ value: ProductListItem['category']; label: string }> = [
  { value: 'ALMACEN', label: 'Almacen' },
  { value: 'VERDURAS', label: 'Verduras' },
  { value: 'FRUTAS', label: 'Frutas' },
  { value: 'LACTEOS', label: 'Lacteos' },
  { value: 'CARNES', label: 'Carnes' },
  { value: 'CONGELADOS', label: 'Congelados' },
  { value: 'LIMPIEZA', label: 'Limpieza' },
  { value: 'OTROS', label: 'Otros' }
];

const PRODUCT_FILTER_OPTIONS: Array<{ value: 'ALL' | ProductListItem['category']; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  ...PRODUCT_CATEGORY_OPTIONS
];
