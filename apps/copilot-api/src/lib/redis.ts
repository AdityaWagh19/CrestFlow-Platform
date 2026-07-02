import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('redis');

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ compatibility
  enableReadyCheck: true,
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis reconnect attempts exhausted');
      return null;
    }
    return Math.min(times * 200, 5000);
  },
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err: Error) => logger.error({ err }, 'Redis connection error'));
