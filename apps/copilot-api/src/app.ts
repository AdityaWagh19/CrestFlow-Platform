import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config/env.js';
import { requestIdHook } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('app');

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
  });

  // CORS (ADD-05)
  await app.register(cors, {
    origin: config.FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  });

  // Request ID injection
  app.addHook('onRequest', requestIdHook);

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  // Readiness check (ADD-07) — checks PostgreSQL + Redis connectivity
  app.get('/health/ready', async (_req, reply) => {
    const { getPrisma } = await import('@crestflow/shared');
    const { redis } = await import('./lib/redis.js');

    let prismaOk = false;
    let redisOk = false;

    try {
      const db = getPrisma() as { $queryRawUnsafe: (q: string) => Promise<unknown> };
      await db.$queryRawUnsafe('SELECT 1');
      prismaOk = true;
    } catch {
      // postgres not available
    }

    try {
      await redis.ping();
      redisOk = true;
    } catch {
      // redis not available
    }

    const allHealthy = prismaOk && redisOk;
    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ready' : 'not_ready',
      checks: {
        postgres: prismaOk,
        redis: redisOk,
      },
    });
  });

  // ─── Routes ──────────────────────────────────────────────────────────────
  const { authRoutes } = await import('./modules/identity/auth.routes.js');
  await app.register(authRoutes);

  const { portfolioRoutes } = await import('./modules/portfolio/portfolio.routes.js');
  await app.register(portfolioRoutes);

  const { riskRoutes } = await import('./modules/risk/risk.routes.js');
  await app.register(riskRoutes);

  const { strategyRoutes } = await import('./modules/strategy/strategy.routes.js');
  await app.register(strategyRoutes);

  const { yieldRoutes } = await import('./modules/yield/yield.routes.js');
  await app.register(yieldRoutes);

  const { userRoutes } = await import('./modules/user/user.routes.js');
  await app.register(userRoutes);

  const { copilotRoutes } = await import('./modules/copilot/copilot.routes.js');
  await app.register(copilotRoutes);

  // Initialize event-driven engines
  const { initRiskEngine } = await import('./modules/risk/risk.service.js');
  initRiskEngine();

  const { initStrategyEngine } = await import('./modules/strategy/strategy.service.js');
  initStrategyEngine();

  const { initYieldEngine } = await import('./modules/yield/yield.service.js');
  initYieldEngine();

  logger.info('Fastify app built successfully');
  return app;
}
