import CircuitBreaker from 'opossum';
import axios from 'axios';
import { logger } from '../logger.js';

// Circuit breaker options
const breakerOptions = {
  timeout: 4000, // Trigger failure if downstream call takes > 4s
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 8000, // Wait 8s before testing downstream again (HALF-OPEN)
};

/**
 * Underlying HTTP call forwarder
 */
async function callDownstreamService({ method, url, data, params, headers }) {
  const response = await axios({
    method,
    url,
    data,
    params,
    headers: {
      ...headers,
      host: undefined, // Let axios set host header
    },
    validateStatus: () => true, // Don't throw for 4xx/5xx HTTP codes; only throw for network outages
  });
  return response;
}

// Instantiate Opossum Circuit Breakers for both domain microservices
export const rideServiceBreaker = new CircuitBreaker(callDownstreamService, {
  ...breakerOptions,
  name: 'RideServiceBreaker',
});

export const driverServiceBreaker = new CircuitBreaker(callDownstreamService, {
  ...breakerOptions,
  name: 'DriverServiceBreaker',
});

// Circuit Breaker Event Listeners for telemetry
function setupBreakerLogging(breaker, name) {
  breaker.on('open', () => {
    logger.warn({ service: name }, `⚠️ Circuit Breaker OPEN for ${name}. Requests will now fail-fast.`);
  });
  breaker.on('halfOpen', () => {
    logger.info({ service: name }, `🔄 Circuit Breaker HALF-OPEN for ${name}. Testing service recovery...`);
  });
  breaker.on('close', () => {
    logger.info({ service: name }, `✅ Circuit Breaker CLOSED for ${name}. Normal traffic resumed.`);
  });
  breaker.on('fallback', (result) => {
    logger.warn({ service: name }, `Circuit Breaker executed fallback for ${name}`);
  });
}

setupBreakerLogging(rideServiceBreaker, 'Ride Service');
setupBreakerLogging(driverServiceBreaker, 'Driver Service');

// Fallback response generator when circuit is open or downstream fails
rideServiceBreaker.fallback(() => ({
  status: 503,
  data: {
    success: false,
    error: 'ServiceUnavailable',
    circuitStatus: 'OPEN',
    message: 'Ride Service is currently unavailable. Circuit breaker has intercepted the request to protect system stability.',
  },
}));

driverServiceBreaker.fallback(() => ({
  status: 503,
  data: {
    success: false,
    error: 'ServiceUnavailable',
    circuitStatus: 'OPEN',
    message: 'Driver Service is currently unavailable. Circuit breaker has intercepted the request to protect system stability.',
  },
}));

/**
 * Creates an Express route handler that delegates through the circuit breaker
 */
export function createBreakerProxy(breaker, targetBaseUrl) {
  return async (req, res) => {
    const targetUrl = `${targetBaseUrl}${req.originalUrl}`;
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

      res.status(response.status).json(response.data);
    } catch (err) {
      logger.error({ err: err.message, targetUrl }, 'Downstream proxy error');
      res.status(503).json({
        success: false,
        error: 'ServiceUnavailable',
        circuitStatus: breaker.opened ? 'OPEN' : 'CLOSED',
        message: 'Could not reach downstream microservice.',
      });
    }
  };
}
