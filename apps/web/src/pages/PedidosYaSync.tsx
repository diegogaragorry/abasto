import type { PedidosYaBrowserSyncSetup, PedidosYaSessionStatus, StoreSyncSummary } from '@abasto/shared';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { useStoreSyncJob } from '../hooks/useStoreSyncJob';
import {
  createPedidosYaBrowserSyncSetup,
  fetchPedidosYaSession,
  updatePedidosYaSession
} from '../routes/api';

interface PedidosYaSyncProps {
  onSynced: (summary: StoreSyncSummary) => Promise<void> | void;
  isAdminAuthenticated: boolean;
}

type ExtensionStatus = 'checking' | 'available' | 'missing';

interface PedidosYaExtensionProgress {
  status: 'running' | 'completed' | 'failed';
  message: string;
  current?: number;
  total?: number;
  summary?: StoreSyncSummary;
}

export function PedidosYaSync({ onSynced, isAdminAuthenticated }: PedidosYaSyncProps) {
  const [cookieText, setCookieText] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [requestText, setRequestText] = useState('');
  const [sessionStatus, setSessionStatus] = useState<PedidosYaSessionStatus | null>(null);
  const [browserSyncSetup, setBrowserSyncSetup] = useState<PedidosYaBrowserSyncSetup | null>(null);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [isPreparingBrowserSync, setIsPreparingBrowserSync] = useState(false);
  const [isExtensionSyncing, setIsExtensionSyncing] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>('checking');
  const [extensionProgress, setExtensionProgress] = useState<PedidosYaExtensionProgress | null>(null);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [browserSyncNotice, setBrowserSyncNotice] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const { job, error, isSyncing, start } = useStoreSyncJob({
    store: 'pedidosya',
    isAdminAuthenticated,
    onCompleted: onSynced
  });

  const summary = job?.summary ?? null;
  const browserSyncBookmarklet = useMemo(
    () => (browserSyncSetup ? buildPedidosYaBookmarklet(browserSyncSetup) : ''),
    [browserSyncSetup]
  );

  useEffect(() => {
    function handleExtensionReady() {
      setExtensionStatus('available');
    }

    function handleExtensionProgress(event: Event) {
      const progress = (event as CustomEvent<PedidosYaExtensionProgress>).detail;
      setExtensionProgress(progress);
      setIsExtensionSyncing(progress.status === 'running');

      if (progress.status === 'completed' && progress.summary) {
        setSessionError(null);
        void onSynced(progress.summary);
      }

      if (progress.status === 'failed') {
        setSessionError(progress.message);
      }
    }

    window.addEventListener('abasto-peya-extension-ready', handleExtensionReady);
    window.addEventListener('abasto-peya-extension-progress', handleExtensionProgress);
    window.dispatchEvent(new CustomEvent('abasto-peya-extension-ping'));

    const timeoutId = window.setTimeout(() => {
      setExtensionStatus((currentStatus) => (currentStatus === 'checking' ? 'missing' : currentStatus));
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('abasto-peya-extension-ready', handleExtensionReady);
      window.removeEventListener('abasto-peya-extension-progress', handleExtensionProgress);
    };
  }, [onSynced]);

  useEffect(() => {
    if (!isAdminAuthenticated) {
      setSessionStatus(null);
      setBrowserSyncSetup(null);
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

  async function handlePrepareBrowserSync() {
    setIsPreparingBrowserSync(true);
    setCopiedBookmarklet(false);
    setBrowserSyncNotice(null);
    setSessionError(null);

    try {
      const setup = await createPedidosYaBrowserSyncSetup();
      setBrowserSyncSetup(setup);
    } catch (syncError) {
      setSessionError(
        syncError instanceof Error ? syncError.message : 'No se pudo preparar el sincronizador de navegador.'
      );
    } finally {
      setIsPreparingBrowserSync(false);
    }
  }

  function handleRetryExtensionDetection() {
    setExtensionStatus('checking');
    setSessionError(null);
    window.dispatchEvent(new CustomEvent('abasto-peya-extension-ping'));
    window.setTimeout(() => {
      setExtensionStatus((currentStatus) => (currentStatus === 'checking' ? 'missing' : currentStatus));
    }, 900);
  }

  async function handleExtensionSync() {
    if (extensionStatus !== 'available') {
      setSessionError('La extensión de PeYa no está detectada en este navegador.');
      return;
    }

    setIsExtensionSyncing(true);
    setSessionError(null);
    setExtensionProgress({
      status: 'running',
      message: 'Preparando token temporal de Abasto...'
    });

    try {
      const setup = await createPedidosYaBrowserSyncSetup();
      window.dispatchEvent(
        new CustomEvent('abasto-peya-extension-start', {
          detail: {
            ...setup,
            marketUrl: PEDIDOSYA_MARKET_URL
          }
        })
      );
    } catch (syncError) {
      setIsExtensionSyncing(false);
      setSessionError(syncError instanceof Error ? syncError.message : 'No se pudo iniciar la extensión de PeYa.');
    }
  }

  async function handleCopyBookmarklet() {
    if (!browserSyncBookmarklet) {
      return;
    }

    try {
      await navigator.clipboard.writeText(browserSyncBookmarklet);
      setCopiedBookmarklet(true);
      setBrowserSyncNotice(
        'Sincronizador copiado. Abrí PedidosYaMarket y pegalo en la barra de direcciones estando en esa pestaña.'
      );
    } catch {
      setSessionError('No se pudo copiar el sincronizador. Arrastrá el botón a favoritos.');
    }
  }

  function handleBookmarkletClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setBrowserSyncNotice(
      'Este botón no se ejecuta desde Abasto. Arrastralo a la barra de favoritos, abrí PedidosYaMarket y ejecutalo desde esa pestaña.'
    );
  }

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
    } catch (syncError) {
      setSessionError(syncError instanceof Error ? syncError.message : 'No se pudo actualizar la sesión.');
    } finally {
      setIsUpdatingSession(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Sincronización PedidosYa</p>
          <h3>Sincronizar precios sin pegar cookies</h3>
        </div>
      </div>

      <div className="stack">
        <div className="metric-card">
          <span className="muted">Método recomendado</span>
          <strong>Extensión local de navegador</strong>
          <span className="muted">
            La extensión lee PedidosYa desde tu navegador, usando tu sesión real, y guarda los precios con un token
            temporal de Abasto. No hay que pegar cookies, request ni user-agent.
          </span>
        </div>

        <div className="metric-card browser-sync-card">
          <span className={extensionStatus === 'available' ? 'success' : 'warning'}>
            {extensionStatus === 'available'
              ? 'Extensión detectada.'
              : extensionStatus === 'checking'
                ? 'Buscando extensión...'
                : 'Extensión no detectada.'}
          </span>
          {extensionStatus !== 'available' ? (
            <span className="muted">
              Instalá la extensión una vez, recargá Abasto y volvé a intentar. Chrome la necesita porque PedidosYa
              bloquea los métodos web normales.
            </span>
          ) : (
            <span className="muted">Asegurate de haber iniciado sesión en PedidosYa en este mismo navegador.</span>
          )}
          <div className="row-actions left-actions">
            <button
              type="button"
              onClick={() => void handleExtensionSync()}
              disabled={isExtensionSyncing || extensionStatus !== 'available' || !isAdminAuthenticated}
            >
              {isExtensionSyncing ? 'Sincronizando PeYa...' : 'Sincronizar PeYa con extensión'}
            </button>
            <a className="secondary-button action-link" href="/abasto-peya-extension.zip" download>
              Descargar extensión
            </a>
            <button type="button" className="secondary-button" onClick={handleRetryExtensionDetection}>
              Detectar extensión
            </button>
            <a className="secondary-button action-link" href={PEDIDOSYA_MARKET_URL} target="_blank" rel="noreferrer">
              Abrir PedidosYaMarket
            </a>
          </div>
          {extensionProgress ? (
            <div className="extension-progress">
              <span className={extensionProgress.status === 'failed' ? 'warning' : 'muted'}>
                {extensionProgress.message}
              </span>
              {extensionProgress.total ? (
                <span className="muted">
                  {extensionProgress.current ?? 0} / {extensionProgress.total}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {extensionStatus !== 'available' ? (
          <details className="compact-details">
            <summary>Cómo instalar la extensión</summary>
            <div className="stack">
              <p className="muted">
                Descargá el ZIP, descomprimilo, abrí chrome://extensions, activá Modo desarrollador, elegí Cargar
                descomprimida y seleccioná la carpeta descomprimida.
              </p>
            </div>
          </details>
        ) : null}

        <details className="compact-details">
          <summary>Fallback sin extensión: bookmarklet</summary>
          <div className="stack">
            <div className="row-actions left-actions">
              <button
                type="button"
                onClick={() => void handlePrepareBrowserSync()}
                disabled={isPreparingBrowserSync || !isAdminAuthenticated}
              >
                {isPreparingBrowserSync ? 'Preparando...' : 'Preparar bookmarklet PeYa'}
              </button>
              <a
                className="secondary-button action-link"
                href={PEDIDOSYA_MARKET_URL}
                target="_blank"
                rel="noreferrer"
              >
                Abrir PedidosYaMarket
              </a>
            </div>

            {browserSyncSetup ? (
              <div className="metric-card browser-sync-card">
                <span className="muted">
                  Token válido hasta {new Date(browserSyncSetup.expiresAt).toLocaleString('es-UY')}
                </span>
                <strong>Ejecutá el botón desde una pestaña de PedidosYa</strong>
                <span className="muted">
                  Este fallback puede fallar por bloqueos del navegador. La extensión es el camino recomendado.
                </span>
                <div className="row-actions left-actions">
                  <a
                    className="secondary-button action-link bookmarklet-link"
                    href={browserSyncBookmarklet}
                    draggable
                    onClick={handleBookmarkletClick}
                    title="Arrastrá este botón a favoritos y ejecutalo desde PedidosYa."
                  >
                    Arrastrar a favoritos: Sincronizador Abasto PeYa
                  </a>
                  <button type="button" className="secondary-button" onClick={() => void handleCopyBookmarklet()}>
                    {copiedBookmarklet ? 'Copiado' : 'Copiar sincronizador'}
                  </button>
                </div>
                {browserSyncNotice ? <span className="warning">{browserSyncNotice}</span> : null}
              </div>
            ) : null}
          </div>
        </details>

        <details className="compact-details">
          <summary>Fallback técnico avanzado</summary>
          <div className="stack">
            <p className="muted">
              Este camino queda solo como respaldo si PeYa cambia el catálogo o el sincronizador de navegador no puede
              ejecutarse. No es necesario para el flujo normal.
            </p>
            <div className="field">
              <span>Cookie PedidosYa</span>
              <textarea
                className="cookie-textarea"
                value={cookieText}
                onChange={(event) => setCookieText(event.target.value)}
                placeholder="Header Cookie completo o filas copiadas desde DevTools."
              />
            </div>
            <div className="field">
              <span>Request real del navegador</span>
              <textarea
                className="cookie-textarea"
                value={requestText}
                onChange={(event) => setRequestText(event.target.value)}
                placeholder="URL de búsqueda, bloque de headers o Copy as cURL desde DevTools."
              />
            </div>
            <div className="field">
              <span>User-Agent opcional</span>
              <input
                value={userAgent}
                onChange={(event) => setUserAgent(event.target.value)}
                placeholder="User-Agent del mismo navegador."
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
            <p className={sessionStatus.hasCookie ? 'success' : 'muted'}>
              {sessionStatus.hasCookie
                ? 'El backend tiene una sesión técnica disponible.'
                : 'El backend no depende de una cookie manual para el flujo recomendado.'}
            </p>
            {sessionStatus.hasSearchTemplate && sessionStatus.searchTemplateSource ? (
              <p className="muted">
                Template de búsqueda: <strong>{sessionStatus.searchTemplateSource}</strong>
              </p>
            ) : null}
            {sessionStatus.lastAutoRefreshError ? (
              <p className="warning">Último refresh automático falló: {sessionStatus.lastAutoRefreshError}</p>
            ) : null}
          </div>
        ) : null}

        <button type="button" className="secondary-button" onClick={() => void start()} disabled={isSyncing || !isAdminAuthenticated}>
          {isSyncing ? 'Sincronizando...' : 'Intentar sync backend automático'}
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
            <span className="muted">Resumen de la última sincronización backend</span>
            <strong>
              {summary.matched} matcheados / {summary.processed} procesados
            </strong>
            <span className="muted">
              {summary.skipped} omitidos, {summary.failed} fallidos
            </span>
            {summary.message ? <span className={summary.blocked ? 'warning' : 'muted'}>{summary.message}</span> : null}
            {job?.finishedAt ? (
              <span className="muted">Finalizado {new Date(job.finishedAt).toLocaleString('es-UY')}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      {error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}
    </section>
  );
}

const PEDIDOSYA_MARKET_URL =
  'https://www.pedidosya.com.uy/restaurantes/montevideo/pedidosya-market-13-1c303044-02f5-4ec1-a797-2d9b97737801-menu/buscar';

function buildPedidosYaBookmarklet(setup: PedidosYaBrowserSyncSetup): string {
  const code = `(async()=>{const t=${JSON.stringify(setup.token)},ru=${JSON.stringify(
    setup.requestsUrl
  )},su=${JSON.stringify(
    setup.resultsUrl
  )},w=m=>new Promise(r=>setTimeout(r,m));let b=null,s=m=>{try{if(!b){b=document.createElement("div");b.style.cssText="position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:14px 16px;border-radius:16px;background:#163128;color:#fff;font:14px system-ui;box-shadow:0 18px 50px rgba(0,0,0,.25)";document.body.appendChild(b)}b.textContent=m}catch{}};try{if(!location.hostname.endsWith("pedidosya.com.uy")){alert("Abrí PedidosYaMarket y ejecutá este favorito desde esa pestaña.");return}s("Abasto PeYa iniciado. Preparando búsquedas...");const rq=await fetch(ru,{headers:{accept:"application/json",authorization:"Bearer "+t}});if(!rq.ok)throw new Error("No pude obtener búsquedas de Abasto");const cfg=await rq.json(),out=[];for(let i=0;i<cfg.requests.length;i++){const item=cfg.requests[i];s("Abasto PeYa "+(i+1)+"/"+cfg.requests.length+": "+item.query);try{const r=await fetch(item.url,{credentials:"include",headers:{accept:"application/json, text/plain, */*"}});if(!r.ok){out.push({query:item.query,candidates:[]});continue}const j=await r.json();if(j.appId||j.blockScript||j.jsClientSrc)throw new Error("PedidosYa devolvió bloqueo");out.push({query:item.query,candidates:Array.isArray(j.data)?j.data:[]})}catch(e){console.warn("[Abasto PeYa]",item.query,e);out.push({query:item.query,candidates:[]})}await w(300)}s("Abasto PeYa guardando resultados...");const pr=await fetch(su,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+t},body:JSON.stringify({results:out})}),summary=await pr.json().catch(()=>null);if(!pr.ok)throw new Error(summary?.error||"No pude guardar resultados en Abasto");s("Abasto PeYa listo: "+summary.matched+"/"+summary.processed+" productos con precio.");alert("Abasto PeYa listo: "+summary.matched+"/"+summary.processed+" productos con precio.")}catch(e){s("Abasto PeYa falló: "+(e&&e.message?e.message:e));alert("Abasto PeYa falló: "+(e&&e.message?e.message:e))}})()`;

  return `javascript:${code}`;
}
