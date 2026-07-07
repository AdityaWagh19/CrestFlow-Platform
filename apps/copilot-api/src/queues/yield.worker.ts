/**
 * BullMQ worker for yield discovery jobs.
 * Yield is primarily triggered via event bus (PortfolioSnapshotCreated).
 * This worker handles manually enqueued yield scan jobs.
 */

import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@crestflow/shared';

const logger = createLogger('worker:yield');

export function startYieldWorker(redisConnection: { host: string; port: number }) {
  const worker = new Worker(
    QUEUE_NAMES.YIELD,
    (job) => {
      logger.info(
        { jobId: job.id, data: job.data },
        'yield job received — event-driven processing',
      );
      // Yield recompute is handled by initYieldEngine() event listener
      return Promise.resolve();
    },
    { connection: redisConnection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'yield job failed');
  });

  return worker;
}
