/**
 * BullMQ worker for strategy computation jobs.
 * Strategy is primarily triggered via event bus (RiskAnalysisCompleted).
 * This worker handles manually enqueued strategy refresh jobs.
 */

import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@crestflow/shared';

const logger = createLogger('worker:strategy');

export function startStrategyWorker(redisConnection: { host: string; port: number }) {
  const worker = new Worker(
    QUEUE_NAMES.STRATEGY,
    (job) => {
      logger.info(
        { jobId: job.id, data: job.data },
        'strategy job received — event-driven processing',
      );
      // Strategy recompute is handled by initStrategyEngine() event listener
      return Promise.resolve();
    },
    { connection: redisConnection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'strategy job failed');
  });

  return worker;
}
