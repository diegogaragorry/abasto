import type { StoreSyncJobStatus, StoreSyncSummary, StoreSyncTarget } from '@abasto/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStoreSyncStatus, startStoreSync } from '../routes/api';

interface UseStoreSyncJobOptions {
  store: StoreSyncTarget;
  isAdminAuthenticated: boolean;
  onCompleted: (summary: StoreSyncSummary) => Promise<void> | void;
}

export function useStoreSyncJob({ store, isAdminAuthenticated, onCompleted }: UseStoreSyncJobOptions) {
  const [job, setJob] = useState<StoreSyncJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const handledJobIdRef = useRef<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!isAdminAuthenticated) {
      setJob(null);
      return null;
    }

    const nextJob = await fetchStoreSyncStatus(store);
    setJob(nextJob);

    if (nextJob.status === 'completed' && nextJob.jobId && nextJob.summary && handledJobIdRef.current !== nextJob.jobId) {
      handledJobIdRef.current = nextJob.jobId;
      await onCompleted(nextJob.summary);
    }

    if (nextJob.status === 'failed') {
      setError(nextJob.error ?? 'La sincronización del comercio falló');
    }

    return nextJob;
  }, [isAdminAuthenticated, onCompleted, store]);

  useEffect(() => {
    setError(null);
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!isAdminAuthenticated || job?.status !== 'running') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAdminAuthenticated, job?.status, loadStatus]);

  const start = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      const nextJob = await startStoreSync(store);
      setJob(nextJob);
      if (nextJob.status === 'failed') {
        setError(nextJob.error ?? 'La sincronización del comercio falló');
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'La sincronización del comercio falló');
    } finally {
      setIsStarting(false);
    }
  }, [store]);

  return {
    job,
    error,
    isSyncing: isStarting || job?.status === 'running',
    start
  };
}
