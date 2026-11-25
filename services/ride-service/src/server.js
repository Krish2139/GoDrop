import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ridesRouter from './routes/rides.js';
import sosRouter from './routes/sos.js';
import { logger } from './logger.js';
import { isRedisConnected, rideCacheMetrics, getRedisClient } from './redis.js';
import { initRabbitMQ, isRabbitConnected, rabbitMetrics } from './rabbitmq.js';
import { startOutboxPublisher, stopOutboxPublisher, outboxMetrics } from './outboxPublisher.js';
import { expireOffer } from './dispatchEngine.js';
import { isDbConnected, pool } from './db.js';

dotenv.config();

let offerExpiryInterval = null;

export function startOfferExpirationWorker(intervalMs = 3000) {
  if (offerExpiryInterval) return;
  offerExpiryInterval = setInterval(async () => {
    try {
      if (isDbConnected()) {
        const expiredRes = await pool.query(
          `SELECT DISTINCT ride_id FROM ride_assignments 
           WHERE status = 'OFFERED' AND expires_at < NOW()`
        );
        for (const row of expiredRes.rows) {
          logger.info({ rideId: row.ride_id }, '⏰ Expired offer detected. Triggering auto-cascading dispatch...');
          await expireOffer(row.ride_id);
        }
      }
    } catch (err) {
      logger.error(err, 'Error in offer expiration background worker');
    }
  }, intervalMs);
}

export function stopOfferExpirationWorker() {
  if (offerExpiryInterval) {
    clearInterval(offerExpiryInterval);
    offerExpiryInterval = null;
  }
}

const app = express();
const PORT = process.env.RIDE_SERVICE_PORT || 5001;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    }, 'Ride Service Request');
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'ride-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: {
      connected: isRedisConnected(),
      provider: isRedisConnected() ? 'Redis 7 (Alpine)' : 'Degraded-DirectDB',
      cacheMetrics: {
        hits: rideCacheMetrics.hits,
        misses: rideCacheMetrics.misses,
        hitRate: rideCacheMetrics.hitRate,
        invalidations: rideCacheMetrics.invalidations,
      },
    },
    rabbitmq: {
      connected: isRabbitConnected(),
      broker: 'RabbitMQ 3.13 (AMQP :5672)',
      publishedCount: rabbitMetrics.publishedCount,
      outboxRelayed: outboxMetrics.totalProcessed,
    },
  });
});

// GET /api/v1/metrics
app.get('/api/v1/metrics', async (req, res) => {
  let redisMemory = 'N/A';
  if (isRedisConnected()) {
    try {
      const client = getRedisClient();
      const rawInfo = await client.info('memory');
      const usedMatch = rawInfo.match(/used_memory_human:(.+)/);
      if (usedMatch) redisMemory = usedMatch[1].trim();
    } catch {
      // Non-blocking
    }
  }

  res.json({
    service: 'ride-service',
    uptimeSeconds: Math.floor(process.uptime()),
    redis: {
      connected: isRedisConnected(),
      memoryUsed: redisMemory,
      cacheMetrics: {
        hits: rideCacheMetrics.hits,
        misses: rideCacheMetrics.misses,
        hitRate: rideCacheMetrics.hitRate,
        invalidations: rideCacheMetrics.invalidations,
      },
    },
    rabbitmq: {
      connected: isRabbitConnected(),
      publishedCount: rabbitMetrics.publishedCount,
      publishErrors: rabbitMetrics.publishErrors,
      outboxPublisher: {
        totalProcessed: outboxMetrics.totalProcessed,
        pendingCount: outboxMetrics.pendingCount,
        failedCount: outboxMetrics.failedCount,
        lastPollAt: outboxMetrics.lastPollAt,
      },
    },
  });
});

// Domain routes
app.use('/api/v1/rides', ridesRouter);
app.use('/api/v1/sos', sosRouter);
app.use('/api/sos', sosRouter);
app.use('/api/v1/admin/sos', sosRouter);
app.use('/api/admin/sos', sosRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `Route ${req.method} ${req.url} does not exist in Ride Service`,
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error(err, 'Unhandled error in Ride Service');
  res.status(500).json({
    success: false,
    error: 'InternalServerError',
    message: err.message,
  });
});

const server = app.listen(PORT, async () => {
  logger.info(`🚗 Ride Service running on http://localhost:${PORT}`);
  // Initialize RabbitMQ connection & Start Transactional Outbox Publisher
  await initRabbitMQ();
  startOutboxPublisher(1500);
  startOfferExpirationWorker(3000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Closing Ride Service gracefully...');
  stopOutboxPublisher();
  stopOfferExpirationWorker();
  server.close(() => {
    logger.info('Ride Service closed.');
    process.exit(0);
  });
});

export default app;

