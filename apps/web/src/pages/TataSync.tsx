import type { StoreSyncSummary } from '@abasto/shared';
import { useStoreSyncJob } from '../hooks/useStoreSyncJob';

interface TataSyncProps {
  onSynced: (summary: StoreSyncSummary) => Promise<void> | void;
  isAdminAuthenticated: boolean;
}

export function TataSync({ onSynced, isAdminAuthenticated }: TataSyncProps) {
  const { job, error, isSyncing, start } = useStoreSyncJob({
    store: 'tata',
    isAdminAuthenticated,
    onCompleted: onSynced
  });

  const summary = job?.summary ?? null;

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Tata sync</p>
          <h3>Sync supermarket prices manually</h3>
        </div>
      </div>

      <div className="stack">
        <button type="button" onClick={() => void start()} disabled={isSyncing || !isAdminAuthenticated}>
          {isSyncing ? 'Syncing...' : 'Sync Tata prices'}
        </button>

        {job?.status === 'running' ? (
          <div className="metric-card">
            <span className="muted">Sync en curso</span>
            <strong>Procesando catálogo de Tata</strong>
            <span className="muted">
              Iniciado {job.startedAt ? new Date(job.startedAt).toLocaleString('es-UY') : 'recién'}
            </span>
          </div>
        ) : null}

        {summary ? (
          <div className="metric-card">
            <span className="muted">Last sync summary</span>
            <strong>
              {summary.matched} matched / {summary.processed} processed
            </strong>
            <span className="muted">
              {summary.skipped} skipped, {summary.failed} failed
            </span>
            {job?.finishedAt ? <span className="muted">Finalizado {new Date(job.finishedAt).toLocaleString('es-UY')}</span> : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
