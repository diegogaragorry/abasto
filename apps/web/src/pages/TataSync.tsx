import type { StoreSyncSummary } from '@abasto/shared';
import { useState } from 'react';
import { syncTataPrices } from '../routes/api';

interface TataSyncProps {
  onSynced: (summary: StoreSyncSummary) => Promise<void> | void;
  isAdminAuthenticated: boolean;
}

export function TataSync({ onSynced, isAdminAuthenticated }: TataSyncProps) {
  const [summary, setSummary] = useState<StoreSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    setIsSyncing(true);
    setError(null);

    try {
      const result = await syncTataPrices();
      setSummary(result);
      await onSynced(result);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Tata sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Tata sync</p>
          <h3>Sync supermarket prices manually</h3>
        </div>
      </div>

      <div className="stack">
        <button type="button" onClick={handleSync} disabled={isSyncing || !isAdminAuthenticated}>
          {isSyncing ? 'Syncing...' : 'Sync Tata prices'}
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
