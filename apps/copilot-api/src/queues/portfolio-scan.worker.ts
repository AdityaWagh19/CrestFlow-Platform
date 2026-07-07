/**
 * BullMQ worker for portfolio scan jobs.
 * Processes jobs enqueued by auth (onboarding) and manual triggers.
 */

import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@crestflow/shared';
import { PortfolioService } from '../modules/portfolio/portfolio.service.js';

const logger = createLogger('worker:portfolio-scan');

export function startPortfolioScanWorker(redisConnection: { host: string; port: number }) {
  const worker = new Worker(
    QUEUE_NAMES.PORTFOLIO_SCAN,
    async (job) => {
      const { userId, algorandAddress, trigger } = job.data as {
        userId: string;
        algorandAddress: string;
        trigger: string;
      };

      logger.info({ jobId: job.id, userId, trigger }, 'processing portfolio scan job');

      await PortfolioService.runScan(
        userId,
        algorandAddress,
        trigger as 'ONBOARDING' | 'MANUAL' | 'POST_EXECUTION' | 'SCHEDULED',
      );

      logger.info({ jobId: job.id, userId }, 'portfolio scan job complete');
    },
    {
      connection: redisConnection,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'portfolio scan job failed');
  });

  return worker;
}
