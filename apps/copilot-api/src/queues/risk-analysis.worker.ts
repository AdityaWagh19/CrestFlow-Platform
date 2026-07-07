/**
 * BullMQ worker for risk analysis jobs.
 * Note: Risk analysis is primarily triggered via event bus (PortfolioSnapshotCreated).
 * This worker handles manually enqueued risk analysis jobs.
 */

import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@crestflow/shared';
import { eventBus } from '../lib/event-bus.js';

const logger = createLogger('worker:risk-analysis');

export function startRiskAnalysisWorker(redisConnection: { host: string; port: number }) {
  const worker = new Worker(
    QUEUE_NAMES.RISK_ANALYSIS,
    async (job) => {
      const { userId, snapshotId } = job.data as { userId: string; snapshotId: string };
      logger.info({ jobId: job.id, userId }, 'processing risk analysis job');
      // Emit the event that the risk engine already listens to
      eventBus.emit('PortfolioSnapshotCreated', {
        userId,
        snapshotId,
        totalValueUsd: '0',
        healthScore: 0,
        hhi: '0',
        isPartial: false,
        timestamp: new Date().toISOString(),
      });
      logger.info({ jobId: job.id, userId }, 'risk analysis job dispatched');
      await Promise.resolve();
    },
    { connection: redisConnection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'risk analysis job failed');
  });

  return worker;
}
