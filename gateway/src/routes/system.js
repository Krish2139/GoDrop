import express from 'express';
import axios from 'axios';
import { rateLimitMetrics } from '../middleware/rateLimiter.js';
import { rideServiceBreaker, driverServiceBreaker } from '../middleware/circuitBreaker.js';
import { isRedisConnected, redisGatewayMetrics, getRedisClient } from '../redis.js';

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
router.get('/health', (req, res) => {
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
router.get('/health/services', async (req, res) => {
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
router.get('/api/v1/metrics', async (req, res) => {
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
    rateLimiter: {
      algorithm: 'Distributed Token Bucket (Redis)',
      redisBacked: isRedisConnected(),
      totalChecked: rateLimitMetrics.totalRequestsChecked,
      exceededCount429: rateLimitMetrics.rateLimitExceededCount,
      activeTrackedClients: rateLimitMetrics.activeTrackedClients,
    },
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

