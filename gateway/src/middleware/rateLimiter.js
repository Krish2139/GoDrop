import { logger } from '../logger.js';

/**
 * Token Bucket Rate Limiter
 * 
 * Capacity: Maximum burst tokens.
 * Refill Rate: Tokens added per interval.
 * Returns HTTP 429 when capacity is exceeded.
 */
class TokenBucket {
  constructor(capacity = 100, refillRatePerSec = 2) {
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

// Map of IP addresses to TokenBucket instances
const buckets = new Map();

// Metrics tracking for the admin dashboard
export const rateLimitMetrics = {
  totalRequestsChecked: 0,
  rateLimitExceededCount: 0,
  activeTrackedIps: 0,
};

/**
 * Rate Limiting Middleware
 * @param {Object} options
 */
export function rateLimiter(options = {}) {
  const capacity = options.capacity || 100; // max burst
  const refillRatePerSec = options.refillRatePerSec || 2; // ~120/min

  return (req, res, next) => {
    // Exclude health checks from rate limiting
    if (req.path.startsWith('/health')) {
      return next();
    }

    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

    if (!buckets.has(clientIp)) {
      buckets.set(clientIp, new TokenBucket(capacity, refillRatePerSec));
    }

    const bucket = buckets.get(clientIp);
    rateLimitMetrics.totalRequestsChecked++;
    rateLimitMetrics.activeTrackedIps = buckets.size;

    const remaining = bucket.getRemaining();
    res.setHeader('X-RateLimit-Limit', capacity);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!bucket.tryConsume(1)) {
      rateLimitMetrics.rateLimitExceededCount++;
      logger.warn({ ip: clientIp, path: req.path }, 'Rate limit exceeded [HTTP 429]');

      res.setHeader('Retry-After', Math.ceil(1 / refillRatePerSec));
      return res.status(429).json({
        success: false,
        error: 'TooManyRequests',
        message: 'Rate limit exceeded. The system has applied backpressure. Please retry shortly.',
        limit: capacity,
        remaining: 0,
        retryAfterSeconds: Math.ceil(1 / refillRatePerSec),
      });
    }

    next();
  };
}

