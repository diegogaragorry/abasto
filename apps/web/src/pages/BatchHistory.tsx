import type { BatchSummary } from '@abasto/shared';

interface BatchHistoryProps {
  batches: BatchSummary[];
}

export function BatchHistory({ batches }: BatchHistoryProps) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Historial de lotes</p>
          <h3>Importaciones recientes</h3>
        </div>
      </div>

      {batches.length === 0 ? (
        <p className="muted">Todavía no hay lotes.</p>
      ) : (
        <div className="stack">
          {batches.map((batch) => (
            <article key={batch.batchId} className="batch-card">
              <div className="batch-row">
                <strong>Lote #{batch.batchId}</strong>
                <span>{new Date(batch.createdAt).toLocaleString('es-UY')}</span>
              </div>
              <p className="muted">
                {batch.storeName} importó {batch.importedCount} {batch.importedCount === 1 ? 'artículo' : 'artículos'}.
              </p>

              {batch.unmatched.length > 0 ? (
                <div className="unmatched-list">
                  <p>Artículos sin match</p>
                  <ul>
                    {batch.unmatched.map((item, index) => (
                      <li key={`${batch.batchId}-${item.normalized}-${index}`}>
                        {item.raw} ({item.quantity} {item.unit ?? 'unidad'}) - ${item.price}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="success">No hay artículos sin match.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
