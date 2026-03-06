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

const MAX_JOB_DURATION_MS: Record<StoreSyncTarget, number> = {
  tata: 10 * 60 * 1000,
  disco: 15 * 60 * 1000,
  pedidosya: 15 * 60 * 1000
};

const jobs = new Map<StoreSyncTarget, StoreSyncJobRecord>();

export function getStoreSyncJob(store: StoreSyncTarget): StoreSyncJobStatus {
  const currentJob = jobs.get(store);
  if (currentJob) {
    expireJobIfStale(currentJob);
  }

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
  if (currentJob) {
    expireJobIfStale(currentJob);
  }

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
    const summary = await withTimeout(
      runners[job.store](),
      MAX_JOB_DURATION_MS[job.store],
      `${job.store} sync timed out`
    );
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

function expireJobIfStale(job: StoreSyncJobRecord) {
  if (job.status !== 'running') {
    return;
  }

  const startedAt = Date.parse(job.startedAt);
  if (Number.isNaN(startedAt)) {
    return;
  }

  if (Date.now() - startedAt <= MAX_JOB_DURATION_MS[job.store]) {
    return;
  }

  job.status = 'failed';
  job.error = `${job.store} sync expired after waiting too long`;
  job.finishedAt = new Date().toISOString();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
