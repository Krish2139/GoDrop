import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { rateLimiter, rateLimitMetrics } from '../../gateway/src/middleware/rateLimiter.js';
import { getRedisClient } from '../../gateway/src/redis.js';

describe('Unit: Token Bucket Rate Limiting Engine', () => {

  after(() => {
    const r = getRedisClient();
    if (r) r.disconnect();
  });

  it('should initialize with configured capacity and allow initial requests', async () => {
    const middleware = rateLimiter({ capacity: 5, refillRatePerSec: 1 });
    let passed = false;

    const req = {
      path: '/api/v1/test',
      headers: {},
      ip: '192.168.1.100',
    };
    const res = {
      headers: {},
      setHeader(name, val) { this.headers[name] = val; },
      status() { return this; },
      json() { return this; },
    };
    const next = () => { passed = true; };

    await middleware(req, res, next);

    assert.strictEqual(passed, true, 'Request within capacity must be allowed');
    assert.strictEqual(res.headers['X-RateLimit-Limit'], 5);
    assert.ok(parseInt(res.headers['X-RateLimit-Remaining'], 10) >= 0);
  });

  it('should exempt /health probes and /api/v1/metrics from rate limiting', async () => {
    const middleware = rateLimiter({ capacity: 1, refillRatePerSec: 1 });
    let healthPassed = false;
    let metricsPassed = false;

    const reqHealth = { path: '/health', headers: {} };
    const reqMetrics = { path: '/api/v1/metrics', headers: {} };
    const res = { setHeader() {}, status() {}, json() {} };

    await middleware(reqHealth, res, () => { healthPassed = true; });
    await middleware(reqMetrics, res, () => { metricsPassed = true; });

    assert.strictEqual(healthPassed, true, '/health must bypass rate limiting');
    assert.strictEqual(metricsPassed, true, '/api/v1/metrics must bypass rate limiting');
  });

  it('should reject requests with HTTP 429 when capacity is exhausted', async () => {
    const middleware = rateLimiter({ capacity: 2, refillRatePerSec: 0.1 });
    const clientIp = '10.0.0.99';

    const req = {
      path: '/api/v1/rides',
      headers: {},
      ip: clientIp,
    };

    let statusCode = 200;
    let responseBody = null;

    const res = {
      headers: {},
      setHeader(name, val) { this.headers[name] = val; },
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; },
    };

    // Consume first 2 tokens (allowed)
    await middleware(req, res, () => {});
    await middleware(req, res, () => {});

    // 3rd request should exceed capacity (429)
    let nextCalledOnThird = false;
    await middleware(req, res, () => { nextCalledOnThird = true; });

    assert.strictEqual(nextCalledOnThird, false, 'Next middleware must not be called when throttled');
    assert.strictEqual(statusCode, 429, 'Exhausted bucket must respond with HTTP 429 Too Many Requests');
    assert.strictEqual(responseBody.error, 'TooManyRequests');
    assert.ok(res.headers['Retry-After'], 'Must supply Retry-After header');
  });

  it('should track global metrics for requests checked and throttled', () => {
    assert.strictEqual(typeof rateLimitMetrics.totalRequestsChecked, 'number');
    assert.strictEqual(typeof rateLimitMetrics.rateLimitExceededCount, 'number');
    assert.ok(rateLimitMetrics.totalRequestsChecked > 0, 'Total requests checked counter must increment');
  });
});
