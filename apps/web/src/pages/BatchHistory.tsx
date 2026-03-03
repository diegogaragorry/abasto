import type { BatchSummary } from '@abasto/shared';

interface BatchHistoryProps {
  batches: BatchSummary[];
}

export function BatchHistory({ batches }: BatchHistoryProps) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Batch history</p>
          <h3>Recent imports</h3>
        </div>
      </div>

      {batches.length === 0 ? (
        <p className="muted">No batches yet.</p>
      ) : (
        <div className="stack">
          {batches.map((batch) => (
            <article key={batch.batchId} className="batch-card">
              <div className="batch-row">
                <strong>Batch #{batch.batchId}</strong>
                <span>{new Date(batch.createdAt).toLocaleString()}</span>
              </div>
              <p className="muted">
                {batch.storeName} imported {batch.importedCount} item{batch.importedCount === 1 ? '' : 's'}.
              </p>

              {batch.unmatched.length > 0 ? (
                <div className="unmatched-list">
                  <p>Unmatched items</p>
                  <ul>
                    {batch.unmatched.map((item, index) => (
                      <li key={`${batch.batchId}-${item.normalized}-${index}`}>
                        {item.raw} ({item.quantity} {item.unit ?? 'unit'}) - ${item.price}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="success">No unmatched items.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
