import { Queue, type QueueOptions } from 'bullmq';
import { QUEUE_NAMES } from '@crestflow/shared';
import { config } from '../config/env.js';

/** Default queue options with retry, backoff, and dead-letter config (ADD-01). */
const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  connection: {
    host: new URL(config.REDIS_URL).hostname || 'localhost',
    port: parseInt(new URL(config.REDIS_URL).port || '6379', 10),
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s -> 10s -> 20s
    },
    removeOnComplete: { age: 86400 }, // Keep completed jobs for 24h
    removeOnFail: false, // Retain failed jobs for inspection via Bull Board
  },
};

export const portfolioScanQueue = new Queue(QUEUE_NAMES.PORTFOLIO_SCAN, DEFAULT_QUEUE_OPTIONS);
export const riskAnalysisQueue = new Queue(QUEUE_NAMES.RISK_ANALYSIS, DEFAULT_QUEUE_OPTIONS);
export const strategyQueue = new Queue(QUEUE_NAMES.STRATEGY, DEFAULT_QUEUE_OPTIONS);
export const yieldQueue = new Queue(QUEUE_NAMES.YIELD, DEFAULT_QUEUE_OPTIONS);
export const executionQueue = new Queue(QUEUE_NAMES.EXECUTION, DEFAULT_QUEUE_OPTIONS);
export const auditQueue = new Queue(QUEUE_NAMES.AUDIT, DEFAULT_QUEUE_OPTIONS);
export const maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, DEFAULT_QUEUE_OPTIONS);
