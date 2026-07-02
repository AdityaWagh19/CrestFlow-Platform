import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, PaymentRequiredError, createLogger } from '@crestflow/shared';

const logger = createLogger('error-handler');

/**
 * Global Fastify error handler.
 * Maps AppError subclasses to HTTP status codes and returns the standard error envelope.
 */
export function errorHandler(error: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';

  // PaymentRequiredError — special 402 response shape
  if (error instanceof PaymentRequiredError) {
    return reply.status(402).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
      description: error.description,
      price: error.price,
      payTo: error.payTo,
    });
  }

  // Known operational errors
  if (error instanceof AppError) {
    if (!error.isOperational) {
      logger.error({ err: error, requestId }, 'Non-operational AppError');
    }
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    });
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        requestId,
      },
    });
  }

  // Unknown errors — log and return 500
  logger.error({ err: error, requestId }, 'Unhandled error');
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  });
}
