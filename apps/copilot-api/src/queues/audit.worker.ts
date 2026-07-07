/**
 * BullMQ worker for audit event processing.
 * Audit entries are primarily written via event bus listeners.
 * This worker handles batch audit writes for high-volume scenarios.
 */

import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@crestflow/shared';
import { AuditService } from '../modules/audit/audit.service.js';

const logger = createLogger('worker:audit');

export function startAuditWorker(redisConnection: { host: string; port: number }) {
  const worker = new Worker(
    QUEUE_NAMES.AUDIT,
    async (job) => {
      const payload = job.data;
      logger.debug({ jobId: job.id }, 'processing audit job');
      await AuditService.write(payload);
    },
    { connection: redisConnection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'audit job failed');
  });

  return worker;
}
