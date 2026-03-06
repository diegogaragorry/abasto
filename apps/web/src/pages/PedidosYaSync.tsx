import type { PedidosYaSessionStatus, StoreSyncSummary } from '@abasto/shared';
import { useEffect, useState } from 'react';
import { useStoreSyncJob } from '../hooks/useStoreSyncJob';
import { fetchPedidosYaSession, updatePedidosYaSession } from '../routes/api';

interface PedidosYaSyncProps {
  onSynced: (summary: StoreSyncSummary) => Promise<void> | void;
  isAdminAuthenticated: boolean;
}

export function PedidosYaSync({ onSynced, isAdminAuthenticated }: PedidosYaSyncProps) {
  const [cookieText, setCookieText] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [requestText, setRequestText] = useState('');
  const [sessionStatus, setSessionStatus] = useState<PedidosYaSessionStatus | null>(null);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const { job, error, isSyncing, start } = useStoreSyncJob({
    store: 'pedidosya',
    isAdminAuthenticated,
    onCompleted: onSynced
  });

  const summary = job?.summary ?? null;

  useEffect(() => {
    if (!isAdminAuthenticated) {
      setSessionStatus(null);
      return;
    }

    let cancelled = false;

    async function loadSession() {
      try {
        const status = await fetchPedidosYaSession();
        if (!cancelled) {
          setSessionStatus(status);
        }
      } catch {
        if (!cancelled) {
          setSessionStatus(null);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [isAdminAuthenticated]);

  async function handleSessionUpdate() {
    setIsUpdatingSession(true);
    setSessionError(null);

    try {
      const status = await updatePedidosYaSession({
        cookieText,
        userAgent: userAgent.trim() || null,
        requestText: requestText.trim() || null
      });
      setSessionStatus(status);
      setCookieText('');
      setRequestText('');
    } catch (sessionError) {
      setSessionError(sessionError instanceof Error ? sessionError.message : 'No se pudo actualizar la cookie.');
    } finally {
      setIsUpdatingSession(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">PedidosYa sync</p>
          <h3>Sync PedidosYaMarket prices manually</h3>
        </div>
      </div>

      <div className="stack">
        <details>
          <summary>Fallback avanzado: cargar cookie manual</summary>
          <div className="stack">
            <div className="field">
              <span>Cookie PedidosYa</span>
              <textarea
                className="cookie-textarea"
                value={cookieText}
                onChange={(event) => setCookieText(event.target.value)}
                placeholder="Pegá el header Cookie completo o las filas copiadas desde DevTools."
              />
            </div>
            <div className="field">
              <span>Request real del navegador</span>
              <textarea
                className="cookie-textarea"
                value={requestText}
                onChange={(event) => setRequestText(event.target.value)}
                placeholder="Pegá la URL de búsqueda, el bloque de headers o un Copy as cURL desde DevTools."
              />
            </div>
            <div className="field">
              <span>User-Agent opcional</span>
              <input
                value={userAgent}
                onChange={(event) => setUserAgent(event.target.value)}
                placeholder="Pegá el User-Agent del mismo navegador si la cookie sola no alcanza."
              />
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleSessionUpdate()}
              disabled={
                isUpdatingSession ||
                (!cookieText.trim() && !userAgent.trim() && !requestText.trim()) ||
                !isAdminAuthenticated
              }
            >
              {isUpdatingSession ? 'Actualizando...' : 'Actualizar fallback'}
            </button>
          </div>
        </details>

        {sessionStatus ? (
          <div className="stack">
            <p className={sessionStatus.hasCookie ? 'success' : 'warning'}>
              {sessionStatus.hasCookie ? 'Cookie activa en backend.' : 'No hay cookie cargada en backend.'}
            </p>
            <p className={sessionStatus.hasSearchTemplate ? 'success' : 'warning'}>
              {sessionStatus.hasSearchTemplate
                ? 'Template de búsqueda real configurado.'
                : 'Se está usando el catálogo por defecto de PedidosYa.'}
            </p>
            {sessionStatus.hasSearchTemplate && sessionStatus.searchTemplateSource ? (
              <p className="muted">
                Template source: <strong>{sessionStatus.searchTemplateSource}</strong>
              </p>
            ) : null}
            {sessionStatus.source ? (
              <p className="muted">
                Origen: <strong>{sessionStatus.source}</strong>
                {sessionStatus.updatedAt
                  ? ` · actualizada ${new Date(sessionStatus.updatedAt).toLocaleString('es-UY')}`
                  : ''}
              </p>
            ) : null}
            {sessionStatus.searchUrl ? (
              <p className="muted">Search URL: {sessionStatus.searchUrl}</p>
            ) : null}
            {sessionStatus.lastAutoRefreshError ? (
              <p className="warning">Último auto-refresh falló: {sessionStatus.lastAutoRefreshError}</p>
            ) : null}
          </div>
        ) : null}

        <button type="button" onClick={() => void start()} disabled={isSyncing || !isAdminAuthenticated}>
          {isSyncing ? 'Syncing...' : 'Sync PedidosYa prices'}
        </button>

        {job?.status === 'running' ? (
          <div className="metric-card">
            <span className="muted">Sync en curso</span>
            <strong>Consultando catálogo de PedidosYaMarket</strong>
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
            {summary.message ? <span className={summary.blocked ? 'warning' : 'muted'}>{summary.message}</span> : null}
            {job?.finishedAt ? <span className="muted">Finalizado {new Date(job.finishedAt).toLocaleString('es-UY')}</span> : null}
          </div>
        ) : null}
      </div>
      {error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}
    </section>
  );
}
