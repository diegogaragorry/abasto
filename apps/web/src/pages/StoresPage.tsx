import type { BatchSummary, StoreOverview, StoreSyncSummary } from '@abasto/shared';
import { useEffect, useState } from 'react';
import { fetchAuthSession, fetchBatchHistory, fetchStores, updateStore } from '../routes/api';
import { BatchHistory } from './BatchHistory';
import { DiscoSync } from './DiscoSync';
import { FeriaUpload } from './FeriaUpload';
import { PedidosYaSync } from './PedidosYaSync';
import { TataSync } from './TataSync';

export function StoresPage() {
  const [stores, setStores] = useState<StoreOverview[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [nextStores, authSession] = await Promise.all([fetchStores(), fetchAuthSession()]);

        if (!cancelled) {
          setStores(nextStores);
          setIsAdminAuthenticated(authSession.authenticated);
          setError(null);
        }

        if (authSession.authenticated) {
          const nextBatches = await fetchBatchHistory();

          if (!cancelled) {
            setBatches(nextBatches);
          }
        } else if (!cancelled) {
          setBatches([]);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar comercios.');
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

  async function refreshStores() {
    const nextStores = await fetchStores();
    setStores(nextStores);
  }

  async function handleSyncFinished(_summary: StoreSyncSummary) {
    await refreshStores();
  }

  async function handleShippingCostSaved(storeId: number, shippingCost: number) {
    const updatedStore = await updateStore(storeId, { shippingCost });
    setStores((current) => current.map((store) => (store.id === updatedStore.id ? updatedStore : store)));
  }

  function handleBatchUploaded(batch: BatchSummary) {
    setBatches((current) => [batch, ...current]);
    void refreshStores();
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Comercios</p>
          <h2>Operación de precios y logística</h2>
        </div>
        <p className="muted">
          Sincronizá precios, cargá PDFs de feria y definí costo de envío manual por comercio.
        </p>
      </section>

      <div className="commerce-actions-grid">
        <FeriaUpload onUploaded={handleBatchUploaded} isAdminAuthenticated={isAdminAuthenticated} />
        <DiscoSync onSynced={handleSyncFinished} isAdminAuthenticated={isAdminAuthenticated} />
        <TataSync onSynced={handleSyncFinished} isAdminAuthenticated={isAdminAuthenticated} />
        <PedidosYaSync onSynced={handleSyncFinished} isAdminAuthenticated={isAdminAuthenticated} />
      </div>

      {!isAdminAuthenticated ? (
        <section className="panel">
          <p className="warning">Iniciá sesión para ver batches, cargar PDFs y correr sincronizaciones manuales.</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Comercios activos</p>
            <h3>Últimos precios y costo de envío</h3>
          </div>
        </div>

        {isLoading ? <p className="muted">Cargando comercios...</p> : null}
        {!isLoading && error ? <p className="error">{error}</p> : null}
        {!isLoading && !error && stores.length === 0 ? <p className="muted">Todavía no hay comercios para mostrar.</p> : null}

        {!isLoading && !error && stores.length > 0 ? (
          <div className="store-card-grid">
            {stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                onSaveShippingCost={handleShippingCostSaved}
                isAdminAuthenticated={isAdminAuthenticated}
              />
            ))}
          </div>
        ) : null}
      </section>

      {isAdminAuthenticated ? <BatchHistory batches={batches} /> : null}
    </div>
  );
}

function StoreCard({
  store,
  onSaveShippingCost,
  isAdminAuthenticated
}: {
  store: StoreOverview;
  onSaveShippingCost: (storeId: number, shippingCost: number) => Promise<void>;
  isAdminAuthenticated: boolean;
}) {
  const [draftShippingCost, setDraftShippingCost] = useState(String(store.shippingCost));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftShippingCost(String(store.shippingCost));
  }, [store.shippingCost]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await onSaveShippingCost(store.id, Number.parseFloat(draftShippingCost || '0') || 0);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el envío.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="store-card">
      <div className="store-card-header">
        <div>
          <p className="eyebrow">{formatStoreType(store.type)}</p>
          <h4>{store.name}</h4>
        </div>
        <span className="store-update-pill">
          {store.latestUpdateAt ? `Actualizado ${formatDateTime(store.latestUpdateAt)}` : 'Sin precios todavía'}
        </span>
      </div>

      <div className="shipping-editor">
        <label>
          Envío
          <input
            type="number"
            min="0"
            step="1"
            value={draftShippingCost}
            onChange={(event) => setDraftShippingCost(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void handleSave()}
          disabled={isSaving || !isAdminAuthenticated}
        >
          {isSaving ? 'Guardando...' : 'Guardar envío'}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="store-price-list">
        {store.recentPrices.length === 0 ? (
          <p className="muted">No hay precios cargados para este comercio.</p>
        ) : (
          store.recentPrices.map((price) => (
            <div key={`${store.id}-${price.productId}-${price.capturedAt}`} className="store-price-row">
              <div>
                <strong>{capitalizeFirstLetter(price.productName)}</strong>
                {price.sourceLabel ? <small>{price.sourceLabel}</small> : null}
              </div>
              <div className="store-price-value">
                <strong>
                  ${formatMoney(price.normalizedPrice ?? price.price)}
                  {price.normalizedUnit ? ` / ${price.normalizedUnit}` : ''}
                </strong>
                <small>{formatDateTime(price.capturedAt)}</small>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function formatStoreType(type: StoreOverview['type']) {
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
      return type;
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function capitalizeFirstLetter(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
