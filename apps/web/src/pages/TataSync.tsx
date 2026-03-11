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
          <p className="eyebrow">Sincronización Tata</p>
          <h3>Sincronizar precios manualmente</h3>
        </div>
      </div>

      <div className="stack">
        <button type="button" onClick={() => void start()} disabled={isSyncing || !isAdminAuthenticated}>
          {isSyncing ? 'Sincronizando...' : 'Sincronizar precios de Tata'}
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
            <span className="muted">Resumen de la última sincronización</span>
            <strong>
              {summary.matched} matcheados / {summary.processed} procesados
            </strong>
            <span className="muted">
              {summary.skipped} omitidos, {summary.failed} fallidos
            </span>
            {job?.finishedAt ? <span className="muted">Finalizado {new Date(job.finishedAt).toLocaleString('es-UY')}</span> : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
