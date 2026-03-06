import type { StoreSyncJobStatus, StoreSyncSummary, StoreSyncTarget } from '@abasto/shared';
import { randomUUID } from 'node:crypto';
import { syncDiscoPrices } from '../connectors/disco.connector';
import { syncPedidosYaPrices } from '../connectors/pedidosya.connector';
import { syncTataPrices } from '../connectors/tata.connector';

type StoreSyncJobRecord = {
  store: StoreSyncTarget;
  jobId: string;
  status: Exclude<StoreSyncJobStatus['status'], 'idle'>;
  summary: StoreSyncSummary | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const runners: Record<StoreSyncTarget, () => Promise<StoreSyncSummary>> = {
  tata: syncTataPrices,
  disco: syncDiscoPrices,
  pedidosya: syncPedidosYaPrices
};

const jobs = new Map<StoreSyncTarget, StoreSyncJobRecord>();

export function getStoreSyncJob(store: StoreSyncTarget): StoreSyncJobStatus {
  const currentJob = jobs.get(store);
  if (!currentJob) {
    return {
      store,
      jobId: null,
      status: 'idle',
      summary: null,
      error: null,
      startedAt: null,
      finishedAt: null
    };
  }

  return toPublicJob(currentJob);
}

export function startStoreSyncJob(store: StoreSyncTarget): StoreSyncJobStatus {
  const currentJob = jobs.get(store);
  if (currentJob?.status === 'running') {
    return toPublicJob(currentJob);
  }

  const nextJob: StoreSyncJobRecord = {
    store,
    jobId: randomUUID(),
    status: 'running',
    summary: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null
  };

  jobs.set(store, nextJob);
  void runStoreSyncJob(nextJob);
  return toPublicJob(nextJob);
}

async function runStoreSyncJob(job: StoreSyncJobRecord) {
  try {
    const summary = await runners[job.store]();
    const currentJob = jobs.get(job.store);
    if (!currentJob || currentJob.jobId !== job.jobId) {
      return;
    }

    currentJob.status = 'completed';
    currentJob.summary = summary;
    currentJob.error = null;
    currentJob.finishedAt = new Date().toISOString();
  } catch (error) {
    const currentJob = jobs.get(job.store);
    if (!currentJob || currentJob.jobId !== job.jobId) {
      return;
    }

    currentJob.status = 'failed';
    currentJob.error = error instanceof Error ? error.message : 'Store sync failed';
    currentJob.finishedAt = new Date().toISOString();
  }
}

function toPublicJob(job: StoreSyncJobRecord): StoreSyncJobStatus {
  return {
    store: job.store,
    jobId: job.jobId,
    status: job.status,
    summary: job.summary,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt
  };
}
