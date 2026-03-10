import type { BatchSummary, BasketCalculationResult, BasketItemInput, BasketSummary, ProductListItem, ProductUpdateInput } from '@abasto/shared';
import { useEffect, useState } from 'react';
import { calculateBasket, createProduct, deleteProduct, fetchBasket, fetchBatchHistory, fetchProducts, saveBasket, updateProduct } from '../routes/api';
import { BatchHistory } from './BatchHistory';
import { BasketCalculationPanel } from './BasketCalculationPanel';
import { BasketEditor } from './BasketEditor';
import { FeriaUpload } from './FeriaUpload';
import { PedidosYaSync } from './PedidosYaSync';
import { ProductsTable } from './ProductsTable';
import { TataSync } from './TataSync';

export function DashboardPage() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [basket, setBasket] = useState<BasketSummary | null>(null);
  const [calculation, setCalculation] = useState<BasketCalculationResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [isBatchLoading, setIsBatchLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isBasketLoading, setIsBasketLoading] = useState(true);
  const [isBasketSaving, setIsBasketSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      setIsBatchLoading(true);
      setIsProductsLoading(true);
      setIsBasketLoading(true);

      try {
        const [batchResponse, productResponse, basketResponse] = await Promise.all([
          fetchBatchHistory(),
          fetchProducts(),
          fetchBasket()
        ]);

        if (!cancelled) {
          setBatches(batchResponse);
          setProducts(productResponse);
          setBasket(basketResponse);
          setBatchError(null);
          setProductsError(null);
          setBasketError(null);
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load dashboard';
          setBatchError(message);
          setProductsError(message);
          setBasketError(message);
        }
      } finally {
        if (!cancelled) {
          setIsBatchLoading(false);
          setIsProductsLoading(false);
          setIsBasketLoading(false);
        }
      }
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleUploaded(batch: BatchSummary) {
    setBatches((current) => [batch, ...current]);
  }

  async function refreshProducts() {
    setIsProductsLoading(true);
    setProductsError(null);

    try {
      const nextProducts = await fetchProducts();
      setProducts(nextProducts);
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : 'Failed to load products');
    } finally {
      setIsProductsLoading(false);
    }
  }

  async function handleSaveBasket(items: BasketItemInput[]) {
    setIsBasketSaving(true);
    setBasketError(null);

    try {
      const nextBasket = await saveBasket(items);
      setBasket(nextBasket);
      setCalculation(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save basket';
      setBasketError(message);
      throw error;
    } finally {
      setIsBasketSaving(false);
    }
  }

  async function handleCalculateBasket() {
    setIsCalculating(true);
    setCalculationError(null);

    try {
      const result = await calculateBasket();
      setCalculation(result);
    } catch (error) {
      setCalculationError(error instanceof Error ? error.message : 'Failed to calculate basket');
    } finally {
      setIsCalculating(false);
    }
  }

  async function handleProductUpdated(
    productId: number,
    input: ProductUpdateInput
  ) {
    const updatedProduct = await updateProduct(productId, input);

    setProducts((current) => current.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)));
  }

  async function handleProductCreated(input: ProductUpdateInput) {
    const createdProduct = await createProduct(input);
    setProducts((current) => [...current, createdProduct].sort((left, right) => left.name.localeCompare(right.name)));
  }

  async function handleProductDeleted(productId: number) {
    await deleteProduct(productId);
    setProducts((current) => current.filter((product) => product.id !== productId));
    setBasket((current) =>
      current
        ? {
            ...current,
            items: current.items.filter((item) => item.productId !== productId)
          }
        : current
    );
    setCalculation(null);
  }

  return (
    <div className="dashboard-grid">
      <section className="panel hero">
        <p className="eyebrow">Operations</p>
        <h2>Admin dashboard</h2>
        <p className="muted">
          Upload Feria price lists, inspect unmatched products, and prepare the system for shared authentication with
          Ground.
        </p>
      </section>

      <FeriaUpload onUploaded={handleUploaded} isAdminAuthenticated />
      <TataSync onSynced={refreshProducts} isAdminAuthenticated />
      <PedidosYaSync onSynced={refreshProducts} isAdminAuthenticated />

      <ProductsTable
        products={products}
        isLoading={isProductsLoading}
        error={productsError}
        onProductCreated={handleProductCreated}
        onProductUpdated={handleProductUpdated}
        onProductDeleted={handleProductDeleted}
      />

      <BasketEditor
        basket={basket}
        products={products}
        isLoading={isBasketLoading}
        error={basketError}
        isSaving={isBasketSaving}
        isReadOnly={false}
        onSave={handleSaveBasket}
      />

      <BasketCalculationPanel
        result={calculation}
        isLoading={isCalculating}
        error={calculationError}
        onCalculate={handleCalculateBasket}
      />

      {batchError ? <p className="error panel">{batchError}</p> : null}
      {isBatchLoading ? <p className="panel muted">Loading batch history...</p> : <BatchHistory batches={batches} />}
    </div>
  );
}
