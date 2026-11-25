import { logger } from '../logger.js';
import { consumeToken, isRedisConnected, redisGatewayMetrics } from '../redis.js';

/**
 * In-Memory Token Bucket Fallback
 */
class TokenBucket {
  constructor(capacity = 100, refillRatePerSec = 5) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRatePerSec = refillRatePerSec;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsedSec * this.refillRatePerSec;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  tryConsume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  getRemaining() {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// In-Memory store fallback
const memoryBuckets = new Map();

// Global Metrics for Rate Limiting
export const rateLimitMetrics = {
  totalRequestsChecked: 0,
  rateLimitExceededCount: 0,
  activeTrackedClients: 0,
  redisBackedLimiting: false,
};

/**
 * Distributed Token Bucket Rate Limiting Middleware
 * Backed by Redis with seamless in-memory fallback.
 */
export function rateLimiter(options = {}) {
  const capacity = options.capacity || 100;
  const refillRatePerSec = options.refillRatePerSec || 5;

  return async (req, res, next) => {
    // Exempt health probes, metrics, and chaos management from rate limiting
    if (req.path.includes('/health') || req.path.includes('/metrics') || req.path.includes('/chaos')) {
      return next();
    }

    rateLimitMetrics.totalRequestsChecked++;
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : (req.ip || req.connection?.remoteAddress || '127.0.0.1');
    const identifier = req.headers['x-client-id']
      ? `client:${req.headers['x-client-id']}`
      : (req.headers['authorization'] 
          ? `user:${req.headers['authorization'].slice(-16)}` 
          : clientIp);

    let allowed = false;
    let remaining = capacity;
    let rateLimiterSource = 'Memory';

    // 1. Try Distributed Redis Rate Limiter first
    if (isRedisConnected()) {
      rateLimitMetrics.redisBackedLimiting = true;
      const redisResult = await consumeToken(identifier, capacity, refillRatePerSec, 1);
      if (redisResult) {
        allowed = redisResult.allowed;
        remaining = redisResult.remaining;
        rateLimiterSource = 'Redis-Distributed';
      }
    }

    // 2. Graceful Fallback to Local In-Memory Token Bucket if Redis was offline or eval failed
    if (rateLimiterSource === 'Memory') {
      rateLimitMetrics.redisBackedLimiting = false;
      redisGatewayMetrics.fallbackToMemoryCount++;

      if (!memoryBuckets.has(identifier)) {
        memoryBuckets.set(identifier, new TokenBucket(capacity, refillRatePerSec));
      }
      const bucket = memoryBuckets.get(identifier);
      allowed = bucket.tryConsume(1);
      remaining = bucket.getRemaining();
      rateLimitMetrics.activeTrackedClients = memoryBuckets.size;
    }

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', capacity);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Provider', rateLimiterSource);

    if (!allowed) {
      rateLimitMetrics.rateLimitExceededCount++;
      redisGatewayMetrics.rateLimitBlocked429++;

      const retryAfterSeconds = Math.max(1, Math.ceil(1 / refillRatePerSec));
      res.setHeader('Retry-After', retryAfterSeconds);

      logger.warn({
        identifier,
        path: req.path,
        source: rateLimiterSource,
        capacity,
        remaining: 0,
      }, 'Distributed Rate limit exceeded [HTTP 429]');

      return res.status(429).json({
        success: false,
        error: 'TooManyRequests',
        message: 'Rate limit capacity exceeded. Distributed token bucket has throttled this request.',
        limit: capacity,
        remaining: 0,
        retryAfterSeconds,
        provider: rateLimiterSource,
      });
    }

    redisGatewayMetrics.rateLimitHits++;
    next();
  };
}
