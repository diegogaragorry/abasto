import type { BasketCalculationResult, BasketItemInput, BasketSummary, ProductListItem } from '@abasto/shared';
import { useEffect, useState } from 'react';
import { calculateBasket, fetchBasket, fetchProducts, saveBasket } from '../routes/api';
import { BasketCalculationPanel } from './BasketCalculationPanel';
import { BasketEditor } from './BasketEditor';

export function BasketPage({ isAdminAuthenticated }: { isAdminAuthenticated: boolean }) {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [basket, setBasket] = useState<BasketSummary | null>(null);
  const [calculation, setCalculation] = useState<BasketCalculationResult | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isBasketLoading, setIsBasketLoading] = useState(true);
  const [isBasketSaving, setIsBasketSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsProductsLoading(true);
      setIsBasketLoading(true);
      try {
        const [nextProducts, nextBasket] = await Promise.all([fetchProducts(), fetchBasket()]);
        if (!cancelled) {
          setProducts(nextProducts);
          setBasket(nextBasket);
          setProductsError(null);
          setBasketError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'No se pudo cargar la canasta.';
          setProductsError(message);
          setBasketError(message);
        }
      } finally {
        if (!cancelled) {
          setIsProductsLoading(false);
          setIsBasketLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveBasket(items: BasketItemInput[]) {
    setIsBasketSaving(true);
    setBasketError(null);

    try {
      const nextBasket = await saveBasket(items);
      setBasket(nextBasket);
      setCalculation(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la canasta.';
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
      setCalculationError(error instanceof Error ? error.message : 'No se pudo calcular la canasta.');
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Canasta</p>
          <h2>Frecuencias de compra y costo mensual</h2>
        </div>
        <p className="muted">
          Separá compras semanales, bisemanales y mensuales, y revisá el plan agrupado por comercio.
        </p>
      </section>

      {!isAdminAuthenticated ? (
        <section className="panel">
          <p className="warning">Vista de solo lectura. Iniciá sesión para editar cantidades y guardar cambios en la canasta.</p>
        </section>
      ) : null}

      <BasketEditor
        basket={basket}
        products={products}
        isLoading={isBasketLoading || isProductsLoading}
        error={basketError ?? productsError}
        isSaving={isBasketSaving}
        isReadOnly={!isAdminAuthenticated}
        onSave={handleSaveBasket}
      />

      <BasketCalculationPanel
        result={calculation}
        isLoading={isCalculating}
        error={calculationError}
        onCalculate={handleCalculateBasket}
      />
    </div>
  );
}
