import { buildApp } from './app.js';
import { config } from './config/env.js';
import { createLogger, setPrisma } from '@crestflow/shared';
import { PrismaClient } from '@prisma/client';
import { redis } from './lib/redis.js';

const logger = createLogger('server');

// Initialize Prisma singleton and register with shared package
const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
setPrisma(prisma);

async function start() {
  const app = await buildApp();

  // Graceful shutdown (ADD-04)
  async function gracefulShutdown(signal: string) {
    logger.info({ event: 'shutdown_initiated', signal });

    // 1. Stop accepting new HTTP requests
    await app.close();

    // 2. TODO: Pause all BullMQ workers when they are registered
    // await Promise.all(workers.map(w => w.pause()));
    // await Promise.all(workers.map(w => w.close()));

    // 3. Disconnect Prisma
    await prisma.$disconnect();

    // 4. Disconnect Redis
    await redis.quit();

    logger.info({ event: 'shutdown_complete', signal });
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      `CrestFlow Copilot API running on port ${config.PORT}`,
    );
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

void start();
