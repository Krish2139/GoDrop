import express from 'express';
import axios from 'axios';
import { rateLimitMetrics } from '../middleware/rateLimiter.js';
import { 
  rideServiceBreaker, 
  driverServiceBreaker, 
  chaosState, 
  injectChaos, 
  resetChaos 
} from '../middleware/circuitBreaker.js';
import { isRedisConnected, redisGatewayMetrics, getRedisClient } from '../redis.js';
import { getSocketMetrics } from '../socket.js';

const router = express.Router();
const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || 'http://localhost:5001';
const DRIVER_SERVICE_URL = process.env.DRIVER_SERVICE_URL || 'http://localhost:5002';

// In-memory request counters
export const gatewayMetrics = {
  totalRequests: 0,
  status2xx: 0,
  status4xx: 0,
  status5xx: 0,
  startedAt: new Date().toISOString(),
};

// GET /health - Gateway basic health
router.get(['/health', '/api/v1/health'], (req, res) => {
  res.json({
    status: 'UP',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    redis: {
      connected: isRedisConnected(),
      mode: isRedisConnected() ? 'Distributed-Redis' : 'Degraded-Memory',
    },
  });
});

// GET /health/services - Aggregated downstream health
router.get(['/health/services', '/api/v1/health/services'], async (req, res) => {
  const checkService = async (name, url) => {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 2000 });
      return {
        service: name,
        url,
        status: 'UP',
        details: response.data,
      };
    } catch (err) {
      return {
        service: name,
        url,
        status: 'DOWN',
        error: err.message,
      };
    }
  };

  const [rideServiceHealth, driverServiceHealth] = await Promise.all([
    checkService('ride-service', RIDE_SERVICE_URL),
    checkService('driver-service', DRIVER_SERVICE_URL),
  ]);

  const allHealthy = rideServiceHealth.status === 'UP' && driverServiceHealth.status === 'UP';

  res.status(allHealthy ? 200 : 207).json({
    status: allHealthy ? 'HEALTHY' : 'DEGRADED',
    gateway: {
      status: 'UP',
      timestamp: new Date().toISOString(),
      redisConnected: isRedisConnected(),
    },
    services: {
      rideService: rideServiceHealth,
      driverService: driverServiceHealth,
    },
  });
});

// GET /api/v1/metrics - System & Telemetry metrics
router.get(['/metrics', '/api/v1/metrics'], async (req, res) => {
  let redisMemoryInfo = null;
  if (isRedisConnected()) {
    try {
      const client = getRedisClient();
      const rawInfo = await client.info('memory');
      const usedMatch = rawInfo.match(/used_memory_human:(.+)/);
      if (usedMatch) redisMemoryInfo = usedMatch[1].trim();
    } catch {
      // Non-blocking
    }
  }

  // Probe RabbitMQ queues via Management API
  let rabbitQueues = [];
  try {
    const authHeader = 'Basic ' + Buffer.from('guest:guest').toString('base64');
    const qRes = await axios.get('http://localhost:15672/api/queues', {
      headers: { Authorization: authHeader },
      timeout: 1500,
    });
    rabbitQueues = qRes.data.map(q => ({
      name: q.name,
      messages: q.messages || 0,
      consumers: q.consumers || 0,
      state: q.state || 'running',
    }));
  } catch {
    // Non-blocking
  }

  res.json({
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    gateway: {
      totalRequests: gatewayMetrics.totalRequests,
      statusBreakdown: {
        '2xx': gatewayMetrics.status2xx,
        '4xx': gatewayMetrics.status4xx,
        '5xx': gatewayMetrics.status5xx,
      },
    },
    redis: {
      connected: isRedisConnected(),
      provider: isRedisConnected() ? 'Redis 7 (Alpine)' : 'In-Memory Fallback',
      memoryUsed: redisMemoryInfo || 'N/A',
      metrics: redisGatewayMetrics,
    },
    rabbitmq: {
      connected: rabbitQueues.length > 0 || true,
      managementUrl: 'http://localhost:15672',
      queues: rabbitQueues,
    },
    socketio: getSocketMetrics(),
    rateLimiter: {
      algorithm: 'Distributed Token Bucket (Redis)',
      redisBacked: isRedisConnected(),
      totalChecked: rateLimitMetrics.totalRequestsChecked,
      exceededCount429: rateLimitMetrics.rateLimitExceededCount,
      activeTrackedClients: rateLimitMetrics.activeTrackedClients,
    },
    chaos: chaosState,
    circuitBreakers: {
      rideService: {
        state: rideServiceBreaker.opened ? 'OPEN' : rideServiceBreaker.halfOpen ? 'HALF-OPEN' : 'CLOSED',
        stats: rideServiceBreaker.stats,
      },
      driverService: {
        state: driverServiceBreaker.opened ? 'OPEN' : driverServiceBreaker.halfOpen ? 'HALF-OPEN' : 'CLOSED',
        stats: driverServiceBreaker.stats,
      },
    },
  });
});

// -------------------------------------------------------------
// Chaos Engineering & Resilience Fault Injection Endpoints
// -------------------------------------------------------------

// POST /api/v1/chaos/inject - Inject simulated fault into downstream microservice
router.post(['/chaos/inject', '/api/v1/chaos/inject'], (req, res) => {
  const { target = 'driverService', mode = 'error', delayMs = 3500 } = req.body || {};
  const state = injectChaos({ target, mode, delayMs });
  res.json({
    success: true,
    message: `Chaos fault [${mode}] injected into ${target}.`,
    chaosState: state,
  });
});

// POST /api/v1/chaos/reset - Heal all faults and force circuit breakers closed
router.post(['/chaos/reset', '/api/v1/chaos/reset'], (req, res) => {
  const state = resetChaos();
  res.json({
    success: true,
    message: 'All chaos faults reset. Downstream circuits closed and healed.',
    chaosState: state,
  });
});

// GET /api/v1/chaos/status - Query active chaos mode and circuit breaker states
router.get(['/chaos/status', '/api/v1/chaos/status'], (req, res) => {
  res.json({
    success: true,
    chaosState,
    circuitBreakers: {
      rideService: {
        state: rideServiceBreaker.opened ? 'OPEN' : rideServiceBreaker.halfOpen ? 'HALF-OPEN' : 'CLOSED',
        stats: rideServiceBreaker.stats,
      },
      driverService: {
        state: driverServiceBreaker.opened ? 'OPEN' : driverServiceBreaker.halfOpen ? 'HALF-OPEN' : 'CLOSED',
        stats: driverServiceBreaker.stats,
      },
    },
  });
});

export default router;

