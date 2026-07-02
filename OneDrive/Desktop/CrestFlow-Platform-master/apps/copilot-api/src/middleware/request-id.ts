import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

/**
 * Injects a unique X-Request-ID into every request and response.
 * If the client provides one, it is reused; otherwise a new UUID is generated.
 */
export function requestIdHook(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();

  // Make it accessible on the request
  req.headers['x-request-id'] = requestId;

  // Echo it back in the response
  void reply.header('X-Request-ID', requestId);

  done();
}
