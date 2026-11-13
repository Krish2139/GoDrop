import CircuitBreaker from 'opossum';
import axios from 'axios';
import { logger } from '../logger.js';
import { getRedisClient } from '../redis.js';

// Circuit breaker options
const breakerOptions = {
  timeout: 3000,                // Trigger failure if downstream call takes > 3s
  errorThresholdPercentage: 50, // Open circuit if >= 50% of requests fail
  resetTimeout: 4000,            // Wait 4s before entering HALF-OPEN state
  rollingCountTimeout: 10000,   // 10-second rolling statistical window
  rollingCountBuckets: 10,
  volumeThreshold: 3,           // Minimum 3 requests in window before evaluating error percentage
};

// Global Chaos Testing & Fault Injection State
export const chaosState = {
  active: false,
  target: null, // 'rideService' | 'driverService' | 'all'
  mode: null,   // 'error' | 'delay' | 'trip'
  delayMs: 0,
  trippedAt: null,
};

/**
 * Configure Chaos Testing injection
 */
export function injectChaos({ target = 'driverService', mode = 'error', delayMs = 3500 }) {
  chaosState.active = true;
  chaosState.target = target;
  chaosState.mode = mode;
  chaosState.delayMs = delayMs;
  chaosState.trippedAt = new Date().toISOString();

  if (mode === 'trip') {
    if (target === 'rideService' || target === 'all') rideServiceBreaker.open();
    if (target === 'driverService' || target === 'all') driverServiceBreaker.open();
  }

  logger.warn({ chaosState }, '🚨 Chaos fault injected into API Gateway proxy');
  return chaosState;
}

/**
 * Reset all Chaos Testing injections and close circuit breakers
 */
export function resetChaos() {
  chaosState.active = false;
  chaosState.target = null;
  chaosState.mode = null;
  chaosState.delayMs = 0;
  chaosState.trippedAt = null;

  rideServiceBreaker.close();
  driverServiceBreaker.close();

  logger.info('✅ Chaos testing reset: Circuit breakers forced to CLOSED state');
  return chaosState;
}

/**
 * Underlying HTTP call forwarder with Chaos interception and 5xx failure detection
 */
async function callDownstreamService(callParams) {
  const { method, url, data, params, headers, serviceName } = callParams;

  // 1. Chaos Fault Interceptor
  if (chaosState.active && (chaosState.target === serviceName || chaosState.target === 'all')) {
    if (chaosState.mode === 'error') {
      logger.warn({ serviceName }, '💥 Chaos mode [error]: Simulating downstream 500 failure');
      throw new Error(`Chaos Fault Injected: Simulated outage in ${serviceName}`);
    }
    if (chaosState.mode === 'delay') {
      logger.warn({ serviceName, delayMs: chaosState.delayMs }, '⏳ Chaos mode [delay]: Simulating latency spike');
      await new Promise(r => setTimeout(r, chaosState.delayMs));
    }
  }

  // 2. Downstream HTTP Dispatch
  const response = await axios({
    method,
    url,
    data,
    params,
    headers: {
      ...headers,
      host: undefined,
    },
    // 2xx, 3xx, 4xx are valid application traffic; 5xx are server errors that trigger circuit failure
    validateStatus: (status) => status < 500,
    timeout: 3000,
  });

  return response;
}

// Instantiate Opossum Circuit Breakers
export const rideServiceBreaker = new CircuitBreaker(
  (args) => callDownstreamService({ ...args, serviceName: 'rideService' }),
  { ...breakerOptions, name: 'RideServiceBreaker' }
);

export const driverServiceBreaker = new CircuitBreaker(
  (args) => callDownstreamService({ ...args, serviceName: 'driverService' }),
  { ...breakerOptions, name: 'DriverServiceBreaker' }
);

// Event Listeners for State Transition Telemetry
function setupBreakerLogging(breaker, name) {
  breaker.on('open', () => {
    logger.warn({ service: name }, `⚠️ Circuit Breaker OPEN for ${name}. Downstream fast-fail active.`);
  });
  breaker.on('halfOpen', () => {
    logger.info({ service: name }, `🔄 Circuit Breaker HALF-OPEN for ${name}. Probing downstream recovery...`);
  });
  breaker.on('close', () => {
    logger.info({ service: name }, `✅ Circuit Breaker CLOSED for ${name}. Normal traffic resumed.`);
  });
  breaker.on('fallback', (result) => {
    logger.warn({ service: name }, `Circuit Breaker fallback executed for ${name}`);
  });
}

setupBreakerLogging(rideServiceBreaker, 'Ride Service');
setupBreakerLogging(driverServiceBreaker, 'Driver Service');

// -------------------------------------------------------------
// Intelligent Graceful Degradation: Redis-backed Fallbacks
// -------------------------------------------------------------
rideServiceBreaker.fallback(async (err, args) => {
  logger.warn({ err: err?.message }, 'Executing Ride Service Fallback');

  // Attempt to serve cached rides snapshot from Redis
  try {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys('cache:rides:list:*');
      if (keys.length > 0) {
        const cachedRaw = await redis.get(keys[0]);
        if (cachedRaw) {
          const cachedData = JSON.parse(cachedRaw);
          return {
            status: 200,
            headers: {
              'x-circuit-breaker': 'OPEN',
              'x-resilience-fallback': 'REDIS_CACHE',
            },
            data: {
              success: true,
              degraded: true,
              circuitStatus: 'OPEN',
              source: 'Redis-Graceful-Fallback',
              message: 'Ride Service is temporarily unavailable. Serving last-known cached ride snapshot gracefully.',
              total: cachedData.length,
              data: cachedData,
            },
          };
        }
      }
    }
  } catch (cacheErr) {
    logger.warn({ error: cacheErr.message }, 'Ride cache fallback retrieval failed');
  }

  // Graceful 503 Fast-Fail Response
  return {
    status: 503,
    headers: {
      'x-circuit-breaker': 'OPEN',
      'retry-after': '4',
    },
    data: {
      success: false,
      error: 'ServiceUnavailable',
      circuitStatus: 'OPEN',
      message: 'Ride Service is currently unavailable. Circuit breaker has intercepted the request to protect system stability.',
    },
  };
});

driverServiceBreaker.fallback(async (err, args) => {
  logger.warn({ err: err?.message }, 'Executing Driver Service Fallback');

  // Attempt to serve cached driver fleet list from Redis
  try {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys('cache:drivers:list:*');
      if (keys.length > 0) {
        const cachedRaw = await redis.get(keys[0]);
        if (cachedRaw) {
          const cachedData = JSON.parse(cachedRaw);
          return {
            status: 200,
            headers: {
              'x-circuit-breaker': 'OPEN',
              'x-resilience-fallback': 'REDIS_CACHE',
            },
            data: {
              success: true,
              degraded: true,
              circuitStatus: 'OPEN',
              source: 'Redis-Graceful-Fallback',
              message: 'Driver Service is temporarily unavailable. Serving last-known cached driver fleet gracefully.',
              total: cachedData.length,
              data: cachedData,
            },
          };
        }
      }
    }
  } catch (cacheErr) {
    logger.warn({ error: cacheErr.message }, 'Driver cache fallback retrieval failed');
  }

  // Graceful 503 Fast-Fail Response
  return {
    status: 503,
    headers: {
      'x-circuit-breaker': 'OPEN',
      'retry-after': '4',
    },
    data: {
      success: false,
      error: 'ServiceUnavailable',
      circuitStatus: 'OPEN',
      message: 'Driver Service is currently unavailable. Circuit breaker has intercepted the request to protect system stability.',
    },
  };
});

/**
 * Creates an Express route handler that delegates through the circuit breaker
 */
export function createBreakerProxy(breaker, targetBaseUrl) {
  return async (req, res) => {
    const pathOnly = req.originalUrl.split('?')[0];
    const targetUrl = `${targetBaseUrl}${pathOnly}`;

    try {
      const response = await breaker.fire({
        method: req.method,
        url: targetUrl,
        data: req.body,
        params: req.query,
        headers: {
          'x-request-id': req.id,
          'content-type': 'application/json',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
      });

      if (response.headers) {
        if (response.headers['x-circuit-breaker']) {
          res.setHeader('X-Circuit-Breaker', response.headers['x-circuit-breaker']);
        }
        if (response.headers['x-resilience-fallback']) {
          res.setHeader('X-Resilience-Fallback', response.headers['x-resilience-fallback']);
        }
      }

      res.status(response.status).json(response.data);
    } catch (err) {
      logger.error({ err: err.message, targetUrl }, 'Downstream proxy error');
      res.setHeader('X-Circuit-Breaker', breaker.opened ? 'OPEN' : 'CLOSED');
      res.status(503).json({
        success: false,
        error: 'ServiceUnavailable',
        circuitStatus: breaker.opened ? 'OPEN' : 'CLOSED',
        message: 'Could not reach downstream microservice.',
      });
    }
  };
}
