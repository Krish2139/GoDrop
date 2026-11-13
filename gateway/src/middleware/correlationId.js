import crypto from 'crypto';

/**
 * Middleware to generate or propagate a unique correlation ID for every request.
 * Correlates logs across the distributed microservices architecture.
 */
export function correlationIdMiddleware(req, res, next) {
  const correlationId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = correlationId;
  res.setHeader('x-request-id', correlationId);
  next();
}

