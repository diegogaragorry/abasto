import type { PedidosYaSessionStatus, StoreSyncSummary } from '@abasto/shared';
import { useEffect, useState } from 'react';
import { fetchPedidosYaSession, syncPedidosYaPrices, updatePedidosYaSession } from '../routes/api';

interface PedidosYaSyncProps {
  onSynced: (summary: StoreSyncSummary) => Promise<void> | void;
  isAdminAuthenticated: boolean;
}

export function PedidosYaSync({ onSynced, isAdminAuthenticated }: PedidosYaSyncProps) {
  const [summary, setSummary] = useState<StoreSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cookieText, setCookieText] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [sessionStatus, setSessionStatus] = useState<PedidosYaSessionStatus | null>(null);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);

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

  async function handleSync() {
    setIsSyncing(true);
    setError(null);

    try {
      const result = await syncPedidosYaPrices();
      setSummary(result);
      await onSynced(result);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'PedidosYa sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSessionUpdate() {
    setIsUpdatingSession(true);
    setError(null);

    try {
      const status = await updatePedidosYaSession({ cookieText, userAgent: userAgent.trim() || null });
      setSessionStatus(status);
      setCookieText('');
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'No se pudo actualizar la cookie.');
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
          disabled={isUpdatingSession || cookieText.trim().length === 0 || !isAdminAuthenticated}
        >
          {isUpdatingSession ? 'Actualizando...' : 'Actualizar cookie'}
        </button>

        {sessionStatus ? (
          <div className="stack">
            <p className={sessionStatus.hasCookie ? 'success' : 'warning'}>
              {sessionStatus.hasCookie ? 'Cookie activa en backend.' : 'No hay cookie cargada en backend.'}
            </p>
            {sessionStatus.source ? (
              <p className="muted">
                Origen: <strong>{sessionStatus.source}</strong>
                {sessionStatus.updatedAt
                  ? ` · actualizada ${new Date(sessionStatus.updatedAt).toLocaleString('es-UY')}`
                  : ''}
              </p>
            ) : null}
            {sessionStatus.lastAutoRefreshError ? (
              <p className="warning">Último auto-refresh falló: {sessionStatus.lastAutoRefreshError}</p>
            ) : null}
          </div>
        ) : null}

        <button type="button" onClick={handleSync} disabled={isSyncing || !isAdminAuthenticated}>
          {isSyncing ? 'Syncing...' : 'Sync PedidosYa prices'}
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
            {summary.message ? <span className={summary.blocked ? 'warning' : 'muted'}>{summary.message}</span> : null}
          </div>
        ) : null}
      </div>

      {summary?.blocked ? (
        <p className="warning">
          PedidosYa está bloqueando el sync. Refrescá la cookie de sesión antes de volver a intentarlo.
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
