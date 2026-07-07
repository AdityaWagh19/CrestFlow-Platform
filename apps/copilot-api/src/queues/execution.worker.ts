/**
 * BullMQ worker for execution jobs.
 */

import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@crestflow/shared';
import { ExecutionService } from '../modules/execution/execution.service.js';

const logger = createLogger('worker:execution');

export function startExecutionWorker(redisConnection: { host: string; port: number }) {
  const worker = new Worker(
    QUEUE_NAMES.EXECUTION,
    async (job) => {
      const { userId, executionId } = job.data as { userId: string; executionId: string };
      logger.info({ jobId: job.id, userId, executionId }, 'processing execution job');
      await ExecutionService.submitExecution(userId, executionId);
      logger.info({ jobId: job.id, userId, executionId }, 'execution job complete');
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'execution job failed');
  });

  return worker;
}
