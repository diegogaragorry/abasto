import type { ProductListItem, ProductUpdateInput } from '@abasto/shared';
import { useEffect, useState } from 'react';
import { createProduct, deleteProduct, fetchProducts, updateProduct } from '../routes/api';
import { ProductsTable } from './ProductsTable';

export function ProductsPage() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const nextProducts = await fetchProducts();
        if (!cancelled) {
          setProducts(nextProducts);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar productos.');
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

  async function handleProductUpdated(productId: number, input: ProductUpdateInput) {
    const updated = await updateProduct(productId, input);
    setProducts((current) => current.map((product) => (product.id === updated.id ? updated : product)));
  }

  async function handleProductCreated(input: ProductUpdateInput) {
    const created = await createProduct(input);
    setProducts((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
  }

  async function handleProductDeleted(productId: number) {
    await deleteProduct(productId);
    setProducts((current) => current.filter((product) => product.id !== productId));
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Productos</p>
          <h2>Catálogo unificado con precios vigentes</h2>
        </div>
        <p className="muted">Revisá marca, unidad, categoría y el último precio detectado en cada comercio.</p>
      </section>

      <ProductsTable
        products={products}
        isLoading={isLoading}
        error={error}
        onProductCreated={handleProductCreated}
        onProductUpdated={handleProductUpdated}
        onProductDeleted={handleProductDeleted}
      />
    </div>
  );
}
