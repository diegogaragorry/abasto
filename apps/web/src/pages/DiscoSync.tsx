import type { StoreSyncSummary } from '@abasto/shared';
import { useState } from 'react';
import { syncDiscoPrices } from '../routes/api';

interface DiscoSyncProps {
  onSynced: (summary: StoreSyncSummary) => Promise<void> | void;
}

export function DiscoSync({ onSynced }: DiscoSyncProps) {
  const [summary, setSummary] = useState<StoreSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    setIsSyncing(true);
    setError(null);

    try {
      const result = await syncDiscoPrices();
      setSummary(result);
      await onSynced(result);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Disco sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Disco sync</p>
          <h3>Sync Disco prices manually</h3>
        </div>
      </div>

      <div className="stack">
        <button type="button" onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? 'Syncing...' : 'Sync Disco prices'}
        </button>

        {summary ? (
          <div className="metric-card">
            <span className="muted">Last sync summary</span>
            <strong>
              {summary.matched} matched / {summary.processed} processed
            </strong>
            <span className="muted">
              {summary.skipped} skipped, {summary.failed} failed
            </span>
          </div>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
